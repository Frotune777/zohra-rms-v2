# Custom Hooks Usage Guide

This guide shows how to use the custom hooks for data management in your components.

## Available Hooks

### 1. useEmployees
Manages employee data with CRUD operations.

```javascript
import { useEmployees } from '../hooks';

function EmployeeList() {
  const {
    employees,
    loading,
    error,
    refetch,
    createEmployee,
    updateEmployee,
    deleteEmployee
  } = useEmployees();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {employees.map(emp => (
        <div key={emp.id}>{emp.full_name}</div>
      ))}
    </div>
  );
}
```

### 2. useVendors
Manages vendor/supplier data with CRUD operations.

```javascript
import { useVendors } from '../hooks';

function VendorList() {
  const { vendors, loading, createVendor, updateVendor, deleteVendor } = useVendors();

  const handleCreate = async () => {
    await createVendor({
      name: 'New Vendor',
      vendor_type: 'Supplier',
      // ... other fields
    });
  };

  return (
    <div>
      {vendors.map(vendor => (
        <div key={vendor.id}>{vendor.name}</div>
      ))}
    </div>
  );
}
```

### 3. usePayroll
Manages payroll data for a specific month/year.

```javascript
import { usePayroll } from '../hooks';

function PayrollPage() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const {
    payrollData,
    loading,
    runPayroll,
    approvePayroll,
    processPayment
  } = usePayroll(month, year);

  const handleRunPayroll = async (employeeId) => {
    await runPayroll(employeeId, {
      overtimeHours: 10,
      bonuses: 5000
    });
  };

  return <div>{/* Payroll UI */}</div>;
}
```

### 4. useFinance
Manages financial data and transactions.

```javascript
import { useFinance } from '../hooks';

function FinancePage() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const {
    financeData,
    transactions,
    loading,
    addRevenue,
    addExpense,
    deleteTransaction
  } = useFinance(month, year);

  const handleAddRevenue = async () => {
    await addRevenue({
      description: 'Sales',
      amount: 10000
    });
  };

  return (
    <div>
      <p>Revenue: ₹{financeData.revenue}</p>
      <p>Expenses: ₹{financeData.expenses}</p>
      <p>Profit: ₹{financeData.profit}</p>
    </div>
  );
}
```

### 5. usePagination
Adds pagination to any array of data.

```javascript
import { usePagination, Pagination } from '../hooks';

function LargeTable({ data }) {
  const {
    paginatedData,
    currentPage,
    totalPages,
    goToPage,
    hasNextPage,
    hasPreviousPage,
    startIndex,
    endIndex,
    totalItems
  } = usePagination(data, 10); // 10 items per page

  return (
    <div>
      <table>
        {paginatedData.map(item => (
          <tr key={item.id}>
            <td>{item.name}</td>
          </tr>
        ))}
      </table>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={goToPage}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
        startIndex={startIndex}
        endIndex={endIndex}
        totalItems={totalItems}
      />
    </div>
  );
}
```

## Error Boundary

Wrap your app or specific components to catch errors gracefully.

```javascript
import ErrorBoundary from '../components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <YourApp />
    </ErrorBoundary>
  );
}
```

## Benefits

### Before (Manual Data Fetching)
```javascript
const [employees, setEmployees] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await axios.get('http://localhost:5000/api/employees', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEmployees(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  fetchData();
}, []);
```

### After (Using Custom Hook)
```javascript
const { employees, loading } = useEmployees();
```

**Result**: 15+ lines reduced to 1 line! 🎉

## Best Practices

1. **Use hooks at component level**: Don't call hooks conditionally
2. **Handle loading states**: Always check `loading` before rendering data
3. **Handle errors**: Display error messages to users
4. **Refetch when needed**: Use `refetch()` after mutations
5. **Combine with other hooks**: Works great with `usePagination`

## Example: Complete Component

```javascript
import { useEmployees, usePagination, Pagination } from '../hooks';
import { Button } from '../components/forms';

function EmployeeManagement() {
  const { employees, loading, createEmployee, deleteEmployee } = useEmployees();
  const {
    paginatedData,
    currentPage,
    totalPages,
    goToPage,
    ...paginationProps
  } = usePagination(employees, 10);

  if (loading) return <div>Loading employees...</div>;

  return (
    <div>
      <Button onClick={() => createEmployee({ name: 'New Employee' })}>
        Add Employee
      </Button>

      <table>
        {paginatedData.map(emp => (
          <tr key={emp.id}>
            <td>{emp.full_name}</td>
            <td>
              <Button variant="danger" onClick={() => deleteEmployee(emp.id)}>
                Delete
              </Button>
            </td>
          </tr>
        ))}
      </table>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={goToPage}
        {...paginationProps}
      />
    </div>
  );
}
```

This combines custom hooks, reusable components, and pagination for a complete solution!
