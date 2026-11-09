
import pandas as pd

try:
    # Load the Excel file
    xl = pd.ExcelFile(
        "/home/zohra/Desktop/zohra-rms/zohra-rms-v2/Daily_Restaurant_Tracking.xlsx"
    )

    print("Sheet Names:", xl.sheet_names)

    if "Summary" in xl.sheet_names:
        df = xl.parse("Summary")
        print("\nSummary Sheet Head:")
        print(df.head(20).to_string())

        # Also let's check the 'Daily Transactions' columns just in case
    if "Daily Transactions" in xl.sheet_names:
        df_tx = xl.parse("Daily Transactions")
        print("\nDaily Transactions Columns:", df_tx.columns.tolist())

except Exception as e:
    print("Error reading Excel:", e)
