# Component Migration Guide

This guide shows how to migrate existing components to use the new utilities and reusable components.

## Example: PaymentEntry.jsx Migration

### Before (Old Approach)
```javascript
import axios from 'axios';

const fetchSuppliers = async () => {
    try {
        const token = localStorage.getItem('token');
        const res = await axios.get('http://localhost:5000/api/chicken/suppliers', {
            headers: { Authorization: `Bearer ${token}` }
        });
        setSuppliers(res.data);
    } catch (err) {
        console.error(err);
    }
};

// Manual form fields
<input
    type="number"
    value={formData.amount}
    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white"
    required
/>
```

### After (New Approach)
```javascript
import api from '../../utils/api';
import { validatePositiveNumber } from '../../utils/validation';
import { Input, Button } from '../../components/forms';

const fetchSuppliers = async () => {
    try {
        const res = await api.get('/chicken/suppliers');
        setSuppliers(res.data);
    } catch (err) {
        console.error(err);
        toast.error('Failed to load suppliers');
    }
};

// Reusable component with built-in validation
<Input
    label="Amount (₹)"
    type="number"
    value={formData.amount}
    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
    error={errors.amount}
    required
    placeholder="0.00"
/>
```

## Benefits

### 1. Centralized API (`api.js`)
- ✅ Auto token injection
- ✅ Consistent error handling
- ✅ Auto redirect on 401
- ✅ No more `localStorage.getItem('token')` everywhere

### 2. Validation Utilities
- ✅ Reusable validation functions
- ✅ Consistent error messages
- ✅ Easy to test

### 3. Reusable Components
- ✅ Consistent styling
- ✅ Built-in error display
- ✅ Loading states
- ✅ Less code duplication

## Migration Checklist

For each component:
- [ ] Replace `axios` imports with `import api from '../utils/api'`
- [ ] Remove manual token handling
- [ ] Add validation using utility functions
- [ ] Replace manual form fields with reusable components
- [ ] Add proper error states
- [ ] Test the component

## Quick Reference

### API Calls
```javascript
// GET
const data = await api.get('/endpoint');

// POST
await api.post('/endpoint', payload);

// PUT
await api.put('/endpoint/:id', payload);

// DELETE
await api.delete('/endpoint/:id');
```

### Validation
```javascript
import { validatePositiveNumber, validateRequired } from '../utils/validation';

const error = validatePositiveNumber(amount, 'Amount');
if (error) {
    setErrors({ ...errors, amount: error });
}
```

### Form Components
```javascript
import { Input, Select, Textarea, Button } from '../components/forms';

<Input label="Name" value={name} onChange={...} error={errors.name} required />
<Select label="Category" options={opts} value={cat} onChange={...} />
<Textarea label="Notes" value={notes} onChange={...} />
<Button variant="primary" loading={submitting}>Save</Button>
```
