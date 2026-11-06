#!/usr/bin/env python3
"""Build test admission fixtures with original Belenios commands only.

Output contains public archives and one encrypted ballot. The temporary foreign
credential is never returned, logged or written to public evidence.
"""
import base64
import io
import json
import pathlib
import sys
import tarfile
import tempfile
from reference import command, event_data, export_archive, process, write


def variants(encoded):
    verified = process({'action': 'verify', 'archive': encoded})
    if verified['ballotCount'] != 0 or verified['closed']:
        raise ValueError('EMPTY_OPEN_FIXTURE_REQUIRED')
    raw = base64.b64decode(encoded, validate=True)
    data, events = event_data(raw)
    setup = data[next(e['payload'] for e in events if e['type'] == 'Setup')]
    with tarfile.open(fileobj=io.BytesIO(raw)) as stream:
        files = {name: stream.extractfile(setup[key] + '.data.json').read().decode()
                 for name, key in [('election.json', 'election'),
                                   ('trustees.json', 'trustees'),
                                   ('public_creds.json', 'credentials')]}

    def assemble(election, credentials, trustees):
        with tempfile.TemporaryDirectory() as temporary:
            directory = pathlib.Path(temporary)
            for name, contents in files.items():
                write(directory, name, contents)
            write(directory, 'election.json', election)
            write(directory, 'public_creds.json', credentials)
            write(directory, 'trustees.json', trustees)
            command(directory, 'archive', 'init')
            command(directory, 'election', 'verify')
            return export_archive(directory)

    with tempfile.TemporaryDirectory() as temporary:
        directory = pathlib.Path(temporary)
        subject = 'TEST-PERSON-0006'
        write(directory, 'voters.txt', subject + '\n')
        command(directory, 'setup', 'generate-credentials', '--uuid', verified['election']['uuid'],
                '--group', 'Ed25519', '--file', 'voters.txt')
        private = json.loads(next(directory.glob('*.privcreds')).read_text())[subject]
        foreign_public = json.loads(next(directory.glob('*.pubcreds')).read_text())
        foreign_ballot = process({'action': 'generate-test-ballot', 'archive': encoded,
                                 'credential': private, 'choice': [[1, 0, 0]]})['ballot']
    original_credentials = json.loads(files['public_creds.json'])
    if any(credential in original_credentials for credential in foreign_public):
        raise ValueError('FOREIGN_FIXTURE_COLLISION')
    extended = assemble(files['election.json'], json.dumps(original_credentials + foreign_public, separators=(',', ':')), files['trustees.json'])
    changed = {}
    for name in ['otherEnvironment', 'changedContext']:
        election = json.loads(files['election.json'])
        manifest = json.loads(election['description'])
        if name == 'otherEnvironment':
            if manifest['environment'] != 'test':
                raise ValueError('TEST_ENVIRONMENT_REQUIRED')
            manifest['environment'] = 'demo'
        else:
            manifest['context'] += ' Змінений контекст у тестовому режимії перевірки.'
        election['description'] = json.dumps(manifest, ensure_ascii=False, separators=(',', ':'))
        changed[name] = assemble(json.dumps(election, ensure_ascii=False, separators=(',', ':')), files['public_creds.json'], files['trustees.json'])
    other = process({'action': 'setup', 'manifest': json.loads(verified['election']['description']),
                     'persons': ['TEST-PERSON-0001', 'TEST-PERSON-0003', 'TEST-PERSON-0004']})
    other_raw = base64.b64decode(other['archive'], validate=True)
    other_data, other_events = event_data(other_raw)
    other_setup = other_data[next(e['payload'] for e in other_events if e['type'] == 'Setup')]
    with tarfile.open(fileobj=io.BytesIO(other_raw)) as stream:
        other_trustees = stream.extractfile(other_setup['trustees'] + '.data.json').read().decode()
    rotated = json.loads(other['electionRaw'])
    rotated['uuid'] = verified['election']['uuid']
    return {'extendedRoster': extended, 'foreignBallot': foreign_ballot,
            'otherPoll': other['archive'],
            'rotatedKeys': assemble(json.dumps(rotated, ensure_ascii=False, separators=(',', ':')), files['public_creds.json'], other_trustees),
            **changed}


if __name__ == '__main__':
    print(json.dumps(variants(json.load(sys.stdin)['archive'])))
