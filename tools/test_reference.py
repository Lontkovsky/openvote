#!/usr/bin/env python3
"""Real cryptographic smoke/adversarial test; generated secrets stay temporary."""
import base64
import hashlib
import json
import pathlib
import sys
import tempfile
import time
from reference import command, export_archive, load_archive, process
from test_admission_variants import variants as admission_variants

checks = []
started = time.monotonic()


def rejected(name, request):
    try:
        process(request)
    except ValueError:
        checks.append({'name': name, 'outcome': 'Rejected', 'evidence': 'AutomatedTested'})
        return
    raise AssertionError(name + ' was accepted')


manifest = {'environment': 'test', 'question': 'Чи підтримуєте ви тестову пропозицію відкритих бібліотечних даних?',
            'version': 1, 'policy': {'id': 'verified-rnokpp-owner', 'version': 1}, 'publicationThreshold': 3,
            'context': 'Тестовий тест. Жодних реальних учасників.', 'opensAt': '2026-01-01T00:00:00Z',
            'closesAt': '2026-01-02T00:00:00Z'}
persons = [f'TEST-PERSON-{i:04d}' for i in range(1, 6)]
setup = process({'action': 'setup', 'manifest': manifest, 'persons': persons})
archive = setup['archive']
checks.append({'name': 'Reference 2-of-3 plus mandatory trustee ceremony', 'outcome': 'Passed', 'evidence': 'AutomatedTested'})
admission = admission_variants(archive)
rejected('Genuine foreign issuer credential absent from the frozen roster',
         {'action': 'accept', 'archive': archive, 'ballot': admission['foreignBallot']})
expanded = process({'action': 'accept', 'archive': admission['extendedRoster'], 'ballot': admission['foreignBallot']})
assert process({'action': 'verify', 'archive': expanded['archive']})['ballotCount'] == 1
checks.append({'name': 'A replaced trusted roster admits an issuer-created credential without proving a person exists',
               'outcome': 'KnownLimitation', 'evidence': 'AutomatedTested'})
ballots = []
choices = [0, 0, 1, 2, 0]
for person, answer in zip(persons, choices):
    ballot = process({'action': 'generate-test-ballot', 'archive': archive,
                      'credential': setup['privateCredentials'][person],
                      'choice': [[int(i == answer) for i in range(3)]]})['ballot']
    ballots.append(ballot)
    accepted = process({'action': 'accept', 'archive': archive, 'ballot': ballot})
    archive = accepted['archive']
for name, target in [('same UUID in another environment', admission['otherEnvironment']),
                     ('same UUID with changed official context', admission['changedContext']),
                     ('same UUID with rotated trustee keys', admission['rotatedKeys'])]:
    target_report = process({'action': 'verify', 'archive': target})
    assert target_report['election']['uuid'] == setup['uuid']
    rejected('Replay into ' + name, {'action': 'accept', 'archive': target, 'ballot': ballots[0]})
other = process({'action': 'verify', 'archive': admission['otherPoll']})
assert other['election']['uuid'] != setup['uuid']
rejected('Replay into another election with identical question and policy',
         {'action': 'accept', 'archive': admission['otherPoll'], 'ballot': ballots[0]})
same = process({'action': 'accept', 'archive': archive, 'ballot': ballots[0]})
assert same['replayed'] and same['archive'] == archive
checks.append({'name': 'Byte-identical redelivery is idempotent', 'outcome': 'Passed', 'evidence': 'AutomatedTested'})
different = process({'action': 'generate-test-ballot', 'archive': archive,
                     'credential': setup['privateCredentials'][persons[0]], 'choice': [[0, 1, 0]]})['ballot']
rejected('Same right with a different ballot', {'action': 'accept', 'archive': archive, 'ballot': different})
invalid = json.loads(ballots[0]); invalid['credential'] = '00' * 32
rejected('Unregistered signing credential', {'action': 'accept', 'archive': archive, 'ballot': json.dumps(invalid, separators=(',', ':'))})
invalid_proof = json.loads(ballots[0]); invalid_proof['answers'][0]['individual_proofs'][0][0]['response'] = '0'
rejected('Corrupted zero-knowledge proof', {'action': 'accept', 'archive': setup['archive'], 'ballot': json.dumps(invalid_proof, separators=(',', ':'))})
invalid_ciphertext = json.loads(ballots[0]); invalid_ciphertext['answers'][0]['choices'][0]['alpha'] = '00' * 32
rejected('Corrupted ciphertext', {'action': 'accept', 'archive': setup['archive'], 'ballot': json.dumps(invalid_ciphertext, separators=(',', ':'))})
rejected('Decryption before finality', {'action': 'share', 'archive': archive, 'trustee': setup['trustees'][0]})
closed = process({'action': 'close', 'archive': archive})['archive']
shares = [process({'action': 'share', 'archive': closed, 'trustee': key})['share'] for key in setup['trustees']]
for trustee_id, share in enumerate(shares, 1):
    assert process({'action': 'verify-share', 'archive': closed, 'share': share}) == {
        'verifiedBy': 'Belenios 3.3.0 check_factor', 'trusteeId': trustee_id}
checks.append({'name': 'Every mandatory and threshold share passes native check_factor before storage', 'outcome': 'Passed', 'evidence': 'AutomatedTested'})
partial = json.loads(shares[0].split('\n')[0])
proof = partial['decryption_proofs'][0][0]
proof['response'] = '1' if proof['response'] == '0' else '0'
damaged = json.dumps(partial, separators=(',', ':'))
damaged_share = damaged + '\n' + json.dumps({'owner': 1, 'payload': hashlib.sha256(damaged.encode()).hexdigest()}, separators=(',', ':'))
rejected('Hash-consistent corrupted partial decryption proof', {'action': 'verify-share', 'archive': closed, 'share': damaged_share})
owner = json.loads(shares[0].split('\n')[1]); owner['owner'] = 2
rejected('Genuine partial decryption assigned to another trustee', {'action': 'verify-share', 'archive': closed, 'share': shares[0].split('\n')[0] + '\n' + json.dumps(owner, separators=(',', ':'))})
owner['owner'] = 1; owner['payload'] = '0' * 64
rejected('Partial decryption payload hash substitution', {'action': 'verify-share', 'archive': closed, 'share': shares[0].split('\n')[0] + '\n' + json.dumps(owner, separators=(',', ':'))})
rejected('Partial decryption intake before closure', {'action': 'verify-share', 'archive': archive, 'share': shares[0]})
rejected('Insufficient quorum', {'action': 'finalize', 'archive': closed, 'shares': shares[:2]})
rejected('Threshold trustees without mandatory trustee', {'action': 'finalize', 'archive': closed, 'shares': shares[1:]})
rejected('Corrupt partial decryption in a complete quorum', {'action': 'finalize', 'archive': closed, 'shares': [damaged_share, *shares[1:3]]})
for pair in [(1, 2), (1, 3), (2, 3)]:
    assert process({'action': 'finalize', 'archive': closed, 'shares': [shares[0], shares[pair[0]], shares[pair[1]]]})['result']['result'] == [[3, 1, 1]]
checks.append({'name': 'Each two-of-three threshold quorum plus mandatory trustee yields the same native tally', 'outcome': 'Passed', 'evidence': 'AutomatedTested'})
published = process({'action': 'finalize', 'archive': closed, 'shares': shares[:3]})
rejected('Partial decryption intake after publication', {'action': 'verify-share', 'archive': published['archive'], 'share': shares[0]})
assert published['result']['result'] == [[3, 1, 1]], published['result']
verified = process({'action': 'verify', 'archive': published['archive']})
assert verified['ballotCount'] == 5
checks.append({'name': 'Five encrypted votes independently tally to 3/1/1', 'outcome': 'Passed', 'evidence': 'AutomatedTested'})
with tempfile.TemporaryDirectory() as temporary:
    directory = pathlib.Path(temporary)
    load_archive(directory, closed)
    for share in shares:
        command(directory, 'archive', 'add-event', '--type=PartialDecryption', stdin=share + '\n')
    command(directory, 'archive', 'add-event', '--type=Result', stdin='{"result":[[2,2,1]]}\n')
    forged = export_archive(directory)
rejected('Hash-consistent forged tally', {'action': 'verify', 'archive': forged})
tampered = bytearray(base64.b64decode(published['archive'])); tampered[1700] ^= 1
rejected('Tampered public archive', {'action': 'verify', 'archive': base64.b64encode(tampered).decode()})
rejected('Production mock ceremony', {'action': 'setup', 'manifest': {**manifest, 'environment': 'production'}, 'persons': persons})
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
(out / 'election.bel').write_bytes(base64.b64decode(published['archive']))
(out / 'result.json').write_text(json.dumps(published['result'], ensure_ascii=False, indent=2) + '\n')
report = {'core': 'Belenios 3.3.0', 'source': '337887bd1862c7cd057080b530fd80941bfc3c69',
          'scenario': 'test reference CLI tract; browser tract not covered by this command',
          'seconds': round(time.monotonic() - started, 3), 'checks': checks}
(out / 'reference-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
