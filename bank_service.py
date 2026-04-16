class BankError(Exception):
    """Erreur métier de la banque Monopoly."""


class BankService:
    def __init__(self):
        self._accounts = {}
        self._next_id = 1

    def create_account(self, nom, solde_initial=1500):
        if not str(nom or "").strip():
            raise BankError("Le nom du joueur est requis.")

        balance = float(solde_initial)
        if balance < 0:
            raise BankError("Le solde initial doit être positif.")

        account = {"id": self._next_id, "nom": str(nom).strip(), "solde": balance}
        self._accounts[self._next_id] = account
        self._next_id += 1
        return account.copy()

    def list_accounts(self):
        return [account.copy() for account in self._accounts.values()]

    def get_account(self, account_id):
        account = self._accounts.get(int(account_id))
        if not account:
            raise BankError("Compte introuvable.")
        return account.copy()

    def deposit(self, account_id, montant):
        amount = float(montant)
        if amount <= 0:
            raise BankError("Le montant doit être supérieur à 0.")

        account = self._accounts.get(int(account_id))
        if not account:
            raise BankError("Compte introuvable.")

        account["solde"] += amount
        return account.copy()

    def withdraw(self, account_id, montant):
        amount = float(montant)
        if amount <= 0:
            raise BankError("Le montant doit être supérieur à 0.")

        account = self._accounts.get(int(account_id))
        if not account:
            raise BankError("Compte introuvable.")

        if account["solde"] < amount:
            raise BankError("Solde insuffisant.")

        account["solde"] -= amount
        return account.copy()

    def transfer(self, source_id, destination_id, montant):
        amount = float(montant)
        if amount <= 0:
            raise BankError("Le montant doit être supérieur à 0.")
        if int(source_id) == int(destination_id):
            raise BankError("Le transfert vers le même compte est interdit.")

        source = self._accounts.get(int(source_id))
        destination = self._accounts.get(int(destination_id))
        if not source or not destination:
            raise BankError("Compte source ou destination introuvable.")

        if source["solde"] < amount:
            raise BankError("Solde insuffisant pour le transfert.")

        source["solde"] -= amount
        destination["solde"] += amount
        return {
            "source": source.copy(),
            "destination": destination.copy(),
            "montant": amount
        }
