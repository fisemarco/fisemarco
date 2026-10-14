import base64, json, os, sys
sys.path.insert(0, 'public/sdk/python')
from ftai import FTAIClient
c = FTAIClient(os.environ['FTAI_SDK_TEST_URL'], 'FTAI-AAAA-BBBB-CCCC', base64.b64decode(os.environ['FTAI_SDK_TEST_SEED']))
assert c.me()['verified'] is True
assert c.check_authority('fixture', {'action': 'Åä漢字'})['verified'] is True
try:
    FTAIClient('http://untrusted.example', 'x', b'0'*32)
    raise AssertionError('Insecure origin accepted')
except ValueError:
    pass
print('PASS Python Ed25519 request interoperability')
