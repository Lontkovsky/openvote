#!/usr/bin/env python3
"""Transport for unmodified Belenios commands; never implements voting crypto.

JSON stdin/stdout is private process IPC. No request or secret is logged. The
production application must not expose this generic command transport publicly.
"""
import base64
import hashlib
import io
import json
import pathlib
import re
import subprocess
import sys
import tarfile
import tempfile

VERSION = '3.3.0'


def command(directory, *args, stdin=''):
    result = subprocess.run(['belenios-tool', *args], input=stdin, cwd=directory,
                            text=True, capture_output=True, timeout=90)
    if result.returncode != 0:
        # Upstream error strings can echo input. Do not forward those to logs.
        raise ValueError('REFERENCE_REJECTED:' + '/'.join(args[:2]))
    return result.stdout.strip()


def write(directory, name, value):
    path = directory / name
    path.write_text(value)
    path.chmod(0o600)
    return path


def objects(archive):
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:') as stream:
        return [(m.name, json.load(stream.extractfile(m))) for m in stream.getmembers()
                if m.isfile() and m.name.endswith('.json')]


def event_data(archive):
    records = objects(archive)
    data = {n.split('.')[0]: v for n, v in records if n.endswith('.data.json')}
    events = [v for n, v in records if n.endswith('.event.json')]
    return data, events


def inspect_archive(archive):
    data, events = event_data(archive)
    setup_event = next(e for e in events if e['type'] == 'Setup')
    setup = data[setup_event['payload']]
    election = data[setup['election']]
    ballots = [data[e['payload']] for e in events if e['type'] == 'Ballot']
    seen = set()
    for b in ballots:
        if b['credential'] in seen:
            raise ValueError('FINAL_VOTE_DUPLICATE')
        seen.add(b['credential'])
    result_events = [e for e in events if e['type'] == 'Result']
    return {'election': election, 'credentials': data[setup['credentials']],
            'ballots': ballots, 'events': events,
            'result': data[result_events[0]['payload']] if result_events else None}


def load_archive(directory, encoded):
    raw = base64.b64decode(encoded, validate=True)
    # Reference fsck is authoritative; parsed metadata is used only as a guard.
    write(directory, 'input.bel', '')
    (directory / 'input.bel').write_bytes(raw)
    command(directory, 'election', 'verify')
    details = inspect_archive(raw)
    manifest = json.loads(details['election']['description'])
    if manifest['environment'] not in ['development', 'test', 'demo']:
        raise ValueError('PRODUCTION_DISABLED')
    if details['election']['name'] != manifest['question'] or details['election']['questions'] != [
        {'question': manifest['question'], 'answers': ['Підтримую', 'Не підтримую', 'Утримуюсь'], 'min': 1, 'max': 1}
    ]:
        raise ValueError('MANIFEST_QUESTION_MISMATCH')
    if any(not isinstance(c, str) or re.fullmatch('[0-9a-f]{64}', c) is None for c in details['credentials']):
        raise ValueError('UNWEIGHTED_CREDENTIALS_REQUIRED')
    return raw, details


def export_archive(directory):
    files = list(directory.glob('*.bel'))
    if len(files) != 1:
        raise ValueError('ARCHIVE_COUNT')
    return base64.b64encode(files[0].read_bytes()).decode()


def verify_share(directory, raw, details, share):
    if not any(e['type'] == 'EndBallots' for e in details['events']):
        raise ValueError('NOT_FINAL')
    if details['result'] is not None:
        raise ValueError('ALREADY_PUBLISHED')
    if len(details['ballots']) < json.loads(details['election']['description'])['publicationThreshold']:
        raise ValueError('RESULTS_SUPPRESSED')
    data, events = event_data(raw)
    setup = data[next(e['payload'] for e in events if e['type'] == 'Setup')]
    tally = data[next(e['payload'] for e in events if e['type'] == 'EncryptedTally')]
    # These are exact reference data bytes from the already verified archive.
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as stream:
        for name, fingerprint in [('election.json', setup['election']),
                                  ('trustees.json', setup['trustees']),
                                  ('tally.json', tally['encrypted_tally'])]:
            write(directory, name, stream.extractfile(fingerprint + '.data.json').read().decode())
    write(directory, 'share.jsons', share)
    checked = subprocess.run(['openvote-share-verify', 'election.json', 'trustees.json',
                              'tally.json', 'share.jsons'], cwd=directory,
                             capture_output=True, timeout=90)
    if checked.returncode != 0:
        raise ValueError('REFERENCE_REJECTED:share')
    return {'verifiedBy': f'Belenios {VERSION} check_factor',
            'trusteeId': json.loads(share.split('\n')[1])['owner']}


def setup(directory, request):
    manifest = request['manifest']
    if manifest['environment'] not in ['development', 'test', 'demo']:
        raise ValueError('PRODUCTION_DISABLED')
    persons = request['persons']
    if not persons or len(persons) != len(set(persons)):
        raise ValueError('DUPLICATE_PERSON')
    if any(not isinstance(p, str) or not p.startswith('TEST-PERSON-') or
           len(p) != 16 or not p[-4:].isdigit() for p in persons):
        raise ValueError('TEST_IDENTITIES_ONLY')
    uuid = command(directory, 'setup', 'generate-token')
    write(directory, 'voters.txt', '\n'.join(persons) + '\n')
    command(directory, 'setup', 'generate-credentials', '--uuid', uuid,
            '--group', 'Ed25519', '--file', 'voters.txt')
    private = json.loads(next(directory.glob('*.privcreds')).read_text())
    next(directory.glob('*.pubcreds')).rename(directory / 'public_creds.json')
    trustee_ids = []
    for i in range(1, 4):
        key_id = command(directory, 'setup', 'generate-trustee-key-threshold',
                         '--group', 'Ed25519', '--threshold-context', f'{i}/2/3', '--step', '1')
        trustee_ids.append(key_id)
    write(directory, 'certs.jsons', '\n'.join((directory / f'{i}.cert').read_text().strip()
                                            for i in trustee_ids) + '\n')
    base = ['setup', 'generate-trustee-key-threshold', '--group', 'Ed25519', '--certs', 'certs.jsons']
    command(directory, *base, '--step', '2')
    polynomials = [command(directory, *base, '--threshold-context', f'{i}/2/3',
                           '--key', f'{key_id}.key', '--step', '3')
                   for i, key_id in enumerate(trustee_ids, 1)]
    write(directory, 'polynomials.jsons', '\n'.join(polynomials) + '\n')
    command(directory, *base, '--step', '4', '--polynomials', 'polynomials.jsons')
    outputs = [command(directory, *base, '--key', f'{i}.key', '--step', '5',
                       stdin=(directory / f'{i}.vinput').read_text()) for i in trustee_ids]
    threshold = command(directory, *base, '--step', '6', '--polynomials', 'polynomials.jsons',
                        stdin='\n'.join(outputs) + '\n')
    write(directory, 'threshold.json', threshold)
    command(directory, 'setup', 'generate-trustee-key', '--group', 'Ed25519')
    write(directory, 'public_keys.jsons', '\n'.join(p.read_text().strip() for p in directory.glob('*.pubkey')) + '\n')
    command(directory, 'setup', 'make-trustees')
    template = {'name': manifest['question'], 'description': json.dumps(manifest, ensure_ascii=False, separators=(',', ':')),
                'questions': [{'question': manifest['question'], 'answers': ['Підтримую', 'Не підтримую', 'Утримуюсь'],
                               'min': 1, 'max': 1}]}
    write(directory, 'template.json', json.dumps(template, ensure_ascii=False))
    command(directory, 'setup', 'make-election', '--uuid', uuid, '--group', 'Ed25519', '--template', 'template.json')
    election_raw = (directory / 'election.json').read_text().strip()
    command(directory, 'archive', 'init')
    command(directory, 'election', 'verify')
    trustees = [{'id': 1, 'privateKey': next(directory.glob('*.privkey')).read_text().strip()}]
    trustees += [{'id': n + 2, 'key': (directory / f'{i}.key').read_text().strip(),
                  'decryptionKey': (directory / f'{i}.dkey').read_text().strip()}
                 for n, i in enumerate(trustee_ids)]
    return {'uuid': uuid, 'electionRaw': election_raw, 'archive': export_archive(directory),
            'privateCredentials': private, 'trustees': trustees}


def process(request):
    with tempfile.TemporaryDirectory(prefix='openvote-core-') as temp:
        directory = pathlib.Path(temp)
        action = request['action']
        if action == 'setup':
            return setup(directory, request)
        raw, details = load_archive(directory, request['archive'])
        if action == 'verify':
            summary = json.loads(command(directory, 'election', 'compute-ballot-summary'))
            return {'verifiedBy': f'Belenios {VERSION} reference + final-vote guard',
                    'election': details['election'], 'result': details['result'],
                    'closed': any(e['type'] == 'EndBallots' for e in details['events']),
                    'trackers': sorted(base64.b64encode(bytes.fromhex(b['hash'])).decode().rstrip('=') for b in summary),
                    'ballotCount': len(details['ballots'])}
        if action == 'generate-test-ballot':
            # Fixture-only entry point. Browser participation uses upstream JS.
            write(directory, 'credential.txt', request['credential'])
            write(directory, 'choice.json', json.dumps(request['choice']))
            return {'ballot': command(directory, 'election', 'generate-ballot',
                                      '--privcred', 'credential.txt', '--choice', 'choice.json')}
        if action == 'accept':
            if any(e['type'] == 'EndBallots' for e in details['events']):
                raise ValueError('BALLOT_BOX_CLOSED')
            ballot = request['ballot']
            tracker = base64.b64encode(hashlib.sha256(ballot.encode()).digest()).decode().rstrip('=')
            parsed = json.loads(ballot)
            for b in details['ballots']:
                if b['credential'] == parsed['credential']:
                    data, events = event_data(raw)
                    recorded_hash = next(e['payload'] for e in events
                                         if e['type'] == 'Ballot' and data[e['payload']]['credential'] == b['credential'])
                    if hashlib.sha256(ballot.encode()).hexdigest() == recorded_hash:
                        return {'archive': request['archive'], 'tracker': tracker, 'replayed': True,
                                'credential': parsed['credential']}
                    raise ValueError('FINAL_VOTE_ALREADY_CAST')
            write(directory, 'ballot.json', ballot + '\n')
            command(directory, 'election', 'verify-ballot', '--ballot', 'ballot.json')
            command(directory, 'archive', 'add-event', '--type=Ballot', stdin=ballot + '\n')
            command(directory, 'election', 'verify')
            return {'archive': export_archive(directory), 'tracker': tracker, 'replayed': False,
                    'credential': parsed['credential']}
        if action == 'close':
            if any(e['type'] == 'EndBallots' for e in details['events']):
                raise ValueError('ALREADY_CLOSED')
            command(directory, 'archive', 'add-event', '--type=EndBallots')
            aggregate = command(directory, 'election', 'compute-encrypted-tally')
            command(directory, 'archive', 'add-event', '--type=EncryptedTally', stdin=aggregate + '\n')
            command(directory, 'election', 'verify')
            return {'archive': export_archive(directory), 'ballotCount': len(details['ballots'])}
        if action == 'share':
            if not any(e['type'] == 'EndBallots' for e in details['events']):
                raise ValueError('NOT_FINAL')
            manifest = json.loads(details['election']['description'])
            if len(details['ballots']) < manifest['publicationThreshold']:
                raise ValueError('RESULTS_SUPPRESSED')
            if details['result'] is not None:
                raise ValueError('ALREADY_PUBLISHED')
            # Cryptographic aggregate consistency is already verified above.
            # External signed-checkpoint and clock guards belong to trustee CLI.
            key = request['trustee']
            if key['id'] == 1:
                write(directory, 'private.json', key['privateKey'])
                share = command(directory, 'election', 'decrypt', '--privkey', 'private.json', '--trustee-id', '1')
            else:
                write(directory, 'trustee.key', key['key'])
                write(directory, 'trustee.dkey', key['decryptionKey'])
                share = command(directory, 'election', 'decrypt-threshold', '--key', 'trustee.key',
                                '--decryption-key', 'trustee.dkey', '--trustee-id', str(key['id']))
            return {'share': share}
        if action == 'verify-share':
            return verify_share(directory, raw, details, request['share'])
        if action == 'finalize':
            if not any(e['type'] == 'EndBallots' for e in details['events']):
                raise ValueError('NOT_FINAL')
            if len(details['ballots']) < json.loads(details['election']['description'])['publicationThreshold']:
                raise ValueError('RESULTS_SUPPRESSED')
            if details['result'] is not None:
                raise ValueError('ALREADY_PUBLISHED')
            for share in request['shares']:
                command(directory, 'archive', 'add-event', '--type=PartialDecryption', stdin=share + '\n')
            result = command(directory, 'election', 'compute-result')
            command(directory, 'archive', 'add-event', '--type=Result', stdin=result + '\n')
            command(directory, 'election', 'verify')
            return {'archive': export_archive(directory), 'result': json.loads(result)}
        raise ValueError('UNKNOWN_ACTION')


if __name__ == '__main__':
    try:
        request = json.load(sys.stdin)
        print(json.dumps(process(request), ensure_ascii=False))
    except (ValueError, KeyError, StopIteration, subprocess.TimeoutExpired, tarfile.TarError, json.JSONDecodeError) as error:
        # Do not include arbitrary upstream inputs/exception values in errors.
        code = str(error) if isinstance(error, ValueError) and str(error).replace(':', '').replace('/', '').replace('-', '').replace('_', '').isalnum() else 'CORE_REQUEST_REJECTED'
        print(json.dumps({'error': code}), file=sys.stderr)
        raise SystemExit(1)
