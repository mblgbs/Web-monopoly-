import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from bank_service import BankError, BankService


SERVICE = BankService()


class MonopolyBankApiHandler(BaseHTTPRequestHandler):
    def _set_json(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        payload = self.rfile.read(length)
        return json.loads(payload.decode("utf-8"))

    def _write_json(self, status, data):
        self._set_json(status)
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def _parse_account_route(self, path):
        # /comptes/{id}, /comptes/{id}/depot, /comptes/{id}/retrait
        parts = [part for part in path.split("/") if part]
        if len(parts) < 2 or parts[0] != "comptes":
            return None, None
        try:
            account_id = int(parts[1])
        except ValueError:
            return None, None
        action = parts[2] if len(parts) > 2 else None
        return account_id, action

    def do_GET(self):  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/health":
            self._write_json(200, {"status": "ok", "service": "monopoly-bank-api"})
            return

        if path == "/comptes":
            self._write_json(200, {"comptes": SERVICE.list_accounts()})
            return

        account_id, action = self._parse_account_route(path)
        if account_id is not None and action is None:
            try:
                account = SERVICE.get_account(account_id)
                self._write_json(200, account)
            except BankError as error:
                self._write_json(404, {"error": str(error)})
            return

        self._write_json(404, {"error": "Route introuvable."})

    def do_POST(self):  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            body = self._read_json()
        except json.JSONDecodeError:
            self._write_json(400, {"error": "JSON invalide."})
            return

        if path == "/comptes":
            try:
                account = SERVICE.create_account(
                    nom=body.get("nom"), solde_initial=body.get("solde_initial", 1500)
                )
                self._write_json(201, account)
            except (BankError, ValueError, TypeError) as error:
                self._write_json(400, {"error": str(error)})
            return

        if path == "/transferts":
            try:
                result = SERVICE.transfer(
                    source_id=body.get("source_id"),
                    destination_id=body.get("destination_id"),
                    montant=body.get("montant"),
                )
                self._write_json(200, result)
            except (BankError, ValueError, TypeError) as error:
                self._write_json(400, {"error": str(error)})
            return

        account_id, action = self._parse_account_route(path)
        if account_id is not None and action in {"depot", "retrait"}:
            try:
                if action == "depot":
                    account = SERVICE.deposit(account_id, body.get("montant"))
                else:
                    account = SERVICE.withdraw(account_id, body.get("montant"))
                self._write_json(200, account)
            except (BankError, ValueError, TypeError) as error:
                self._write_json(400, {"error": str(error)})
            return

        self._write_json(404, {"error": "Route introuvable."})

    def log_message(self, format_text, *args):
        return


if __name__ == "__main__":
    host = "0.0.0.0"
    port = 8002
    server = ThreadingHTTPServer((host, port), MonopolyBankApiHandler)
    print(f"API Compte de Banque Monopoly sur http://{host}:{port}")
    server.serve_forever()
