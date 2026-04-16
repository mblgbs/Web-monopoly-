import unittest

from bank_service import BankError, BankService


class BankServiceTestCase(unittest.TestCase):
    def setUp(self):
        self.service = BankService()

    def test_create_account(self):
        account = self.service.create_account("Alice", 1500)
        self.assertEqual(account["id"], 1)
        self.assertEqual(account["nom"], "Alice")
        self.assertEqual(account["solde"], 1500)

    def test_depot_and_retrait(self):
        account = self.service.create_account("Bob", 1000)
        updated = self.service.deposit(account["id"], 250)
        self.assertEqual(updated["solde"], 1250)

        updated = self.service.withdraw(account["id"], 200)
        self.assertEqual(updated["solde"], 1050)

    def test_retrait_insuffisant(self):
        account = self.service.create_account("Charly", 100)
        with self.assertRaises(BankError):
            self.service.withdraw(account["id"], 150)

    def test_transfer(self):
        source = self.service.create_account("Alice", 1500)
        destination = self.service.create_account("Eve", 800)

        result = self.service.transfer(source["id"], destination["id"], 300)
        self.assertEqual(result["source"]["solde"], 1200)
        self.assertEqual(result["destination"]["solde"], 1100)


if __name__ == "__main__":
    unittest.main()
