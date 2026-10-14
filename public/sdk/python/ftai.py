"""FTAI signed protocol client. Python 3.10+, cryptography. Keys stay with the caller."""
import base64
import hashlib
import json
import time
import uuid
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

class FTAIError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise FTAIError(code, "FTAI refuses redirects of signed requests")

def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()

def b64(value):
    return base64.urlsafe_b64encode(value).decode().rstrip("=")

class FTAIClient:
    def __init__(self, base_url, code, private_key_seed):
        url = urlsplit(base_url)
        if url.scheme not in ("http", "https") or url.path not in ("", "/") or url.query or url.fragment or url.username or (url.scheme != "https" and url.hostname not in ("localhost", "127.0.0.1")):
            raise ValueError("Use an HTTPS origin (HTTP allowed only on loopback)")
        self.base = base_url.rstrip("/")
        self.code = code
        self.key = Ed25519PrivateKey.from_private_bytes(private_key_seed)
        self.opener = build_opener(NoRedirect())

    def request(self, path, value=None, method="POST"):
        if not path.startswith("/api/v1/") or "?" in path or "#" in path or ".." in path:
            raise ValueError("Use an exact FTAI API path")
        body = b"" if method == "GET" else encoded(value or {})
        timestamp, nonce = str(int(time.time())), str(uuid.uuid4())
        message = "\n".join(("FTAI-Request-v1", self.base, self.code, method, path, timestamp, nonce, hashlib.sha256(body).hexdigest())).encode()
        headers = {"Content-Type": "application/json", "X-FTAI-Agent": self.code, "X-FTAI-Timestamp": timestamp, "X-FTAI-Nonce": nonce, "X-FTAI-Signature": b64(self.key.sign(message))}
        req = Request(self.base+path, data=None if method=="GET" else body, method=method, headers=headers)
        try:
            with self.opener.open(req, timeout=30) as response:
                data = response.read(2_000_001)
                if len(data) > 2_000_000:
                    raise FTAIError(0, "Response exceeds limit")
                return json.loads(data)
        except HTTPError as error:
            raise FTAIError(error.code, error.read(4096).decode(errors="replace")) from error

    def me(self): return self.request("/api/v1/runtime/me", method="GET")
    def check_authority(self, grant, action): return self.request("/api/v1/organisations/authorize", {"grant": grant, "request": action})
    def delegate(self, parent, subject, constraints, expires): return self.request("/api/v1/organisations/delegate", {"parent":parent,"subject":subject,"constraints":constraints,"expires":expires})
    def request_approval(self, grant, action, input_hash): return self.request("/api/v1/organisations/approval-request", {"grant":grant,"request":action,"inputHash":input_hash})
    def consume_approval(self, approval, grant, action, input_hash): return self.request("/api/v1/organisations/approval-consume", {"approval":approval,"grant":grant,"request":action,"inputHash":input_hash})
    def authorize_task(self, task): return self.request("/api/v1/runtime/authorize", task)
    def start_task(self, task_id): return self.request("/api/v1/runtime/permits/"+str(uuid.UUID(task_id))+"/start", {})
    def report_outcome(self, outcome): return self.request("/api/v1/runtime/outcomes", outcome)
