const BASE_URL = 'http://localhost:5000/api';

async function runDebug() {
    try {
        console.log('1. Logging in...');
        const loginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'owner@alzohra.com',
                password: 'password123'
            })
        });

        if (!loginRes.ok) {
            const err = await loginRes.json();
            throw new Error(JSON.stringify(err));
        }

        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log('Login successful. Token obtained.');

        // Test 1: Add Supplier
        console.log('\n2. Testing Add Supplier...');
        const supplierData = {
            name: 'Debug Vendor ' + Date.now(),
            phone: '1234567890',
            payment_type: 'Cash',
            vendor_type: 'Chicken',
            markup_required: true,
            contact_person: 'Debug Debugger',
            email: 'debug@test.com',
            address: '123 Debug Lane',
            gstin: 'GSTIN123'
        };

        const supplierRes = await fetch(`${BASE_URL}/chicken/suppliers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(supplierData)
        });

        if (supplierRes.ok) {
            console.log('✅ Add Supplier Success:', await supplierRes.json());
        } else {
            console.error('❌ Add Supplier Failed:', await supplierRes.text());
        }

        // Test 2: Update Daily Rates
        console.log('\n3. Testing Update Daily Rates...');
        const rateData = {
            date: new Date().toISOString().split('T')[0],
            tandoor_rate: 150.50,
            boiler_rate: 120.00,
            egg_rate: 5.50
        };

        const rateRes = await fetch(`${BASE_URL}/chicken/rates`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(rateData)
        });

        if (rateRes.ok) {
            console.log('✅ Update Rates Success:', await rateRes.json());
        } else {
            console.error('❌ Update Rates Failed:', await rateRes.text());
        }

    } catch (err) {
        console.error('❌ Critical Error:', err.message);
    }
}

runDebug();
