#!/bin/bash
# Quick fix script for remaining axios calls

cd /home/zohra/Desktop/zohra-rms/zohra-rms-v2/client/src/pages

# Fix ExpenseMapping.jsx
sed -i 's/axios\.get(`${API_URL}\/api\/finance\/mappings`, { headers: { Authorization: `Bearer ${token}` } })/api.get("finance\/mappings")/g' finance/ExpenseMapping.jsx
sed -i 's/axios\.get(`${API_URL}\/api\/finance\/tracker\/categories`, { headers: { Authorization: `Bearer ${token}` } })/api.get("finance\/tracker\/categories")/g' finance/ExpenseMapping.jsx
sed -i 's/await axios\.put(`${API_URL}\/api\/finance\/mappings\/${editingId}`, formData, {$/await api.put(`finance\/mappings\/${editingId}`, formData);/g' finance/ExpenseMapping.jsx
sed -i 's/await axios\.post(`${API_URL}\/api\/finance\/mappings`, formData, {$/await api.post("finance\/mappings", formData);/g' finance/ExpenseMapping.jsx
sed -i 's/await axios\.delete(`${API_URL}\/api\/finance\/mappings\/${id}`, {$/await api.delete(`finance\/mappings\/${id}`);/g' finance/ExpenseMapping.jsx

# Fix ManagerFloat.jsx
sed -i 's/await axios\.get(`${API_URL}\/api\/finance\/reconciliation\/float?date=${date}`, {$/await api.get(`finance\/reconciliation\/float?date=${date}`);/g' finance/ManagerFloat.jsx

# Fix report files
sed -i 's/axios\.get/api.get/g' reports/OperationsReports.jsx
sed -i 's/axios\.get/api.get/g' reports/HRReports.jsx
sed -i 's/axios\.get/api.get/g' reports/InventoryReports.jsx
sed -i 's/axios\.get(`${import\.meta\.env\.VITE_API_URL || .http:\/\/localhost:3002.}\/api\/reports/api.get(`reports/g' reports/FinancialReports.jsx

echo "Axios migration complete!"
