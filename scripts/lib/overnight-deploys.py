#!/usr/bin/env python3
"""
What Vercel shipped to production in the last day.

Read from the API rather than from `vercel ls`. Piped, the CLI prints only
deployment URLs on stdout and puts the human-readable table on stderr, so the
ages and build states are not there to parse at all. The API returns an exact
timestamp and state per deployment, which also survives CLI updates.

The CLI's own token is reused. It is already on this machine and already scoped
to this account, and issuing a second one to read a count would be another
credential to store and rotate for no gain.

Prints one line. Never raises: a morning brief that crashes is a brief nobody
trusts, and "could not read" is information too.
"""

import json
import os
import sys
import time
import urllib.request

AUTH = os.path.expanduser(
    "~/Library/Application Support/com.vercel.cli/auth.json"
)

# QUEUED and BUILDING are still in flight. Counting them as failures would cry
# wolf every time the brief runs while a deploy is mid-air.
IN_FLIGHT = ("READY", "QUEUED", "BUILDING", "INITIALIZING")


def api(path: str, token: str):
    request = urllib.request.Request(
        "https://api.vercel.com" + path,
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def main() -> str:
    with open(AUTH) as handle:
        token = json.load(handle)["token"]

    teams = api("/v2/teams", token)["teams"]
    scope = f"teamId={teams[0]['id']}&" if teams else ""
    since = int((time.time() - 24 * 3600) * 1000)

    deployments = api(f"/v6/deployments?{scope}limit=60", token)["deployments"]
    overnight = [
        d
        for d in deployments
        if d.get("createdAt", 0) >= since and d.get("target") == "production"
    ]

    if not overnight:
        return "Deploys: none overnight."

    failed = [d for d in overnight if d.get("readyState") not in IN_FLIGHT]
    if failed:
        return f"Deploys: {len(overnight)} overnight, {len(failed)} FAILED."
    return f"Deploys: {len(overnight)} overnight, all green."


if __name__ == "__main__":
    try:
        print(main())
    except Exception as error:  # noqa: BLE001 - see module docstring
        print(f"Deploys: could not read ({type(error).__name__}).")
        sys.exit(0)
