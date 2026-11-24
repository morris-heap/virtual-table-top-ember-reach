"""Check Jira authentication or create a VTTER task using project credentials."""
import argparse
import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command")
    commands.add_parser("verify", help="Check authentication (the default)")
    create = commands.add_parser("create", help="Create a VTTER task")
    create.add_argument("--summary", required=True)
    create.add_argument("--description", required=True)
    args = parser.parse_args()

    url = os.environ["Jira_URL"].rstrip("/")
    auth = (os.environ["Jira_Email"], os.environ["Jira_Token"])
    headers = {"Accept": "application/json"}

    if args.command == "create":
        response = requests.post(
            f"{url}/rest/api/3/issue",
            auth=auth,
            headers=headers,
            json={"fields": {
                "project": {"key": "VTTER"},
                "issuetype": {"name": "Task"},
                "summary": args.summary,
                "description": {
                    "type": "doc", "version": 1,
                    "content": [{
                        "type": "paragraph",
                        "content": [{"type": "text", "text": args.description}],
                    }],
                },
            }},
            timeout=20,
        )
        response.raise_for_status()
        key = response.json()["key"]
        print(json.dumps({"key": key, "url": f"{url}/browse/{key}"}))
    else:
        response = requests.get(
            f"{url}/rest/api/3/myself", auth=auth, headers=headers, timeout=20,
        )
        response.raise_for_status()
        print("Connected to Jira:", response.json()["displayName"])


if __name__ == "__main__":
    main()
