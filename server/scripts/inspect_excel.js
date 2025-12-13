const XLSX = require('xlsx');
const path = require('path');

try {
    const workbook = XLSX.readFile('/home/zohra/Desktop/zohra-rms/zohra-rms-v2/Daily_Restaurant_Tracking.xlsx');
    console.log("Sheet Names:", workbook.SheetNames);

    if (workbook.SheetNames.includes('Summary')) {
        const sheet = workbook.Sheets['Summary'];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        console.log("\nSummary Sheet Data (First 20 rows):");
        console.log(data.slice(0, 20));
    }

    if (workbook.SheetNames.includes('Daily Transactions')) {
        const sheet = workbook.Sheets['Daily Transactions'];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        console.log("\nDaily Transactions Header:");
        console.log(data[0]);
    }

} catch (err) {
    console.error("Error reading file:", err);
}
