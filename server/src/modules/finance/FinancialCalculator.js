const TransactionService = require('./TransactionService');

class FinancialCalculator {

    async calculateDailySummary(date) {
        const [
            totalSales,
            totalExpenses,
            cashExpenses,
            bankCashExpenses,
            bankExpenses,
            pendingPayments,
            cashSales
        ] = await Promise.all([
            TransactionService.getSumByType(date, 'Sales'),
            TransactionService.getSumByType(date, 'Expense'),
            TransactionService.getExpensesByMethod(date, 'Cash'),
            TransactionService.getExpensesByMethod(date, 'Bank_Cash'),
            TransactionService.getExpensesByMethod(date, 'Bank'),
            TransactionService.getPendingPayments(date),
            TransactionService.getSalesByMethod(date, 'Cash')
        ]);

        const grossProfit = this.calculateGross(totalSales, totalExpenses);

        // Match Excel "Remaining Cash (Bank_Cash)" logic roughly:
        // Cash Sales - Cash Expenses - Bank_Cash Expenses
        // (Assuming Opening Balance is 0 for now as we don't have it tracked in this simple view)
        const remainingCash = cashSales - cashExpenses - bankCashExpenses;

        return {
            date,
            totalSales,
            totalExpenses,
            cashExpenses,
            bankCashExpenses,
            bankExpenses,
            grossProfit,
            cashFlow: remainingCash, // Mapping "Remaining Cash" to what was previously "Cash Flow" for display
            cashSales,
            pendingPayments,
            remainingCash
        };
    }

    calculateGross(sales, expenses) {
        return sales - expenses;
    }

    async calculateCashFlow(date, sales, expenses) {
        return sales - expenses;
    }
}

module.exports = new FinancialCalculator();
