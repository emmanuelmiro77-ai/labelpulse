#!/usr/bin/env python3
"""
Adds VERCEL_DEPLOY_HOOK_URL as a GitHub Actions secret on the
emmanuelmiro77-ai/labelpulse repo using a GitHub PAT.

Flow (per GitHub API docs):
  1. GET /repos/{owner}/{repo}/actions/secrets/public-key
     → returns key_id + base64-encoded NaCl public key
  2. Encrypt the secret value with the public key (libsodium sealed box)
  3. PUT /repos/{owner}/{repo}/actions/secrets/{name}
     with { encrypted_value, key_id }
"""

import base64
import json
import os
import sys
import urllib.request
import urllib.error

from nacl import encoding, public

OWNER = "emmanuelmiro77-ai"
REPO = "labelpulse"
SECRET_NAME = "VERCEL_DEPLOY_HOOK_URL"
SECRET_VALUE = "https://api.vercel.com/v1/integrations/deploy/prj_0VyMLP6kApHuFWvQDF7jC9DhVFzz/43hhmu7U2l"

# Extract token from git remote URL
import subprocess
remote = subprocess.check_output(
    ["git", "-C", "/home/z/my-project", "config", "--get", "remote.origin.url"],
    text=True,
).strip()
# remote looks like: https://ghp_xxx@github.com/owner/repo.git
TOKEN = remote.split("https://")[1].split("@")[0]

HEADERS = {
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}


def gh(method, path, body=None):
    url = f"https://api.github.com/repos/{OWNER}/{REPO}/{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, method=method, headers=HEADERS, data=data)
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode()
            return r.status, (json.loads(txt) if txt else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main():
    print(f"→ Fetching public key for {OWNER}/{REPO}…")
    status, body = gh("GET", "actions/secrets/public-key")
    if status != 200:
        print(f"✗ Failed to fetch public key (HTTP {status}):", body)
        sys.exit(1)
    if isinstance(body, str):
        body = json.loads(body)

    key_id = body["key_id"]
    pub_b64 = body["key"]
    print(f"  key_id = {key_id}")

    pub_key = public.PublicKey(pub_b64.encode(), encoding.Base64Encoder())
    sealed = public.SealedBox(pub_key)
    encrypted = sealed.encrypt(SECRET_VALUE.encode())
    encrypted_b64 = base64.b64encode(encrypted).decode()

    print(f"→ PUT secret {SECRET_NAME}…")
    status, body = gh(
        "PUT",
        f"actions/secrets/{SECRET_NAME}",
        {"encrypted_value": encrypted_b64, "key_id": key_id},
    )
    if status not in (201, 204):
        print(f"✗ Failed to PUT secret (HTTP {status}):", body)
        sys.exit(1)

    print(f"✓ Secret {SECRET_NAME} set successfully.")
    print(f"  Visibility check…")
    status, body = gh("GET", f"actions/secrets/{SECRET_NAME}")
    if status == 200:
        print(f"  Secret exists: name={body.get('name')}, created_at={body.get('created_at')}")
    else:
        print(f"  (visibility check returned {status}, but secret was set)")


if __name__ == "__main__":
    main()
