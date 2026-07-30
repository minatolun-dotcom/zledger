"""Integration test for bill-wise accounting API endpoints."""
import requests
from datetime import date, timedelta

# Test configuration
BASE_URL = "http://localhost:8000/api/v1"
TEST_USER_EMAIL = "admin@apexenterprises.com"
TEST_USER_PASSWORD = "admin123"

def test_bills_api():
    """Test bill-wise accounting API endpoints."""
    
    # 1. Login
    print("1. Authenticating...")
    login_resp = requests.post(
        f"{BASE_URL}/auth/login",
        data={"username": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
    )
    
    if login_resp.status_code != 200:
        print(f"✗ Login failed: {login_resp.status_code}")
        print(login_resp.text)
        return False
    
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("✓ Authenticated")
    
    # 2. Get parties
    print("\n2. Getting parties...")
    parties_resp = requests.get(f"{BASE_URL}/parties", headers=headers)
    if parties_resp.status_code != 200:
        print(f"✗ Get parties failed: {parties_resp.status_code}")
        return False
    
    parties = parties_resp.json()
    if not parties:
        print("✗ No parties found")
        return False
    
    party = parties[0]
    party_id = party["id"]
    print(f"✓ Found party: {party['name']} ({party_id})")
    
    # 3. Get outstanding bills for party
    print(f"\n3. Getting outstanding bills for party {party['name']}...")
    outstanding_resp = requests.get(
        f"{BASE_URL}/bills/outstanding/{party_id}",
        params={"voucher_type": "sales"},
        headers=headers
    )
    
    if outstanding_resp.status_code != 200:
        print(f"✗ Get outstanding bills failed: {outstanding_resp.status_code}")
        print(outstanding_resp.text)
        return False
    
    outstanding = outstanding_resp.json()
    print(f"✓ Outstanding bills: {len(outstanding['bills'])} bills")
    print(f"  Total outstanding: ₹{outstanding['total_outstanding']}")
    
    if outstanding["bills"]:
        first_bill = outstanding["bills"][0]
        print(f"  Example: {first_bill['bill_number']} - ₹{first_bill['outstanding_amount']} ({first_bill['aging_bucket']})")
    
    # 4. List all bill references
    print("\n4. Listing all bill references...")
    list_resp = requests.get(
        f"{BASE_URL}/bills/all",
        params={"limit": 10},
        headers=headers
    )
    
    if list_resp.status_code != 200:
        print(f"✗ List bills failed: {list_resp.status_code}")
        print(list_resp.text)
        return False
    
    bills = list_resp.json()
    print(f"✓ Total bills: {len(bills)}")
    
    if bills:
        for bill in bills[:3]:
            print(f"  {bill['bill_number']}: ₹{bill['original_amount']} ({bill['status']})")
    
    # 5. Get party statement
    print(f"\n5. Getting party statement for {party['name']}...")
    end_date = date.today()
    start_date = end_date - timedelta(days=90)
    
    statement_resp = requests.get(
        f"{BASE_URL}/bills/statement/{party_id}",
        params={
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat()
        },
        headers=headers
    )
    
    if statement_resp.status_code != 200:
        print(f"✗ Get statement failed: {statement_resp.status_code}")
        print(statement_resp.text)
        return False
    
    statement = statement_resp.json()
    print(f"✓ Statement generated: {len(statement['transactions'])} transactions")
    print(f"  Opening: ₹{statement['opening_balance']} {statement['opening_balance_type']}")
    print(f"  Closing: ₹{statement['closing_balance']} {statement['closing_balance_type']}")
    print(f"  Debits: ₹{statement['total_debit']}, Credits: ₹{statement['total_credit']}")
    
    print("\n✓ All bill-wise API tests passed!")
    return True

if __name__ == "__main__":
    try:
        success = test_bills_api()
        exit(0 if success else 1)
    except Exception as e:
        print(f"\n✗ Test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
