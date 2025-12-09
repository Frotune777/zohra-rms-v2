import React, { useState } from 'react';
import { FiDownload, FiFileText, FiFile } from 'react-icons/fi';
import { SiMicrosoftexcel } from 'react-icons/si';
import toast from 'react-hot-toast';

export default function ExportButton({ data, filename, reportType }) {
    const [isExporting, setIsExporting] = useState(false);
    const [showMenu, setShowMenu] = useState(false);

    const exportToCSV = () => {
        try {
            setIsExporting(true);

            if (!data || data.length === 0) {
                toast.error('No data to export');
                return;
            }

            // Convert data to CSV
            const headers = Object.keys(data[0]);
            const csvContent = [
                headers.join(','),
                ...data.map(row =>
                    headers.map(header => {
                        const value = row[header];
                        // Escape commas and quotes
                        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                            return `"${value.replace(/"/g, '""')}"`;
                        }
                        return value;
                    }).join(',')
                )
            ].join('\n');

            // Download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();

            toast.success('CSV exported successfully');
        } catch (error) {
            console.error('Export error:', error);
            toast.error('Failed to export CSV');
        } finally {
            setIsExporting(false);
            setShowMenu(false);
        }
    };

    const exportToJSON = () => {
        try {
            setIsExporting(true);

            const jsonContent = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonContent], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${filename}_${new Date().toISOString().split('T')[0]}.json`;
            link.click();

            toast.success('JSON exported successfully');
        } catch (error) {
            console.error('Export error:', error);
            toast.error('Failed to export JSON');
        } finally {
            setIsExporting(false);
            setShowMenu(false);
        }
    };

    const exportToPDF = () => {
        toast.info('PDF export coming soon!');
        setShowMenu(false);
    };

    return (
        <div className="export-button-container">
            <button
                onClick={() => setShowMenu(!showMenu)}
                className="export-btn"
                disabled={isExporting}
            >
                <FiDownload className="inline mr-2" />
                {isExporting ? 'Exporting...' : 'Export'}
            </button>

            {showMenu && (
                <div className="export-menu">
                    <button onClick={exportToCSV} className="export-menu-item">
                        <FiFile className="inline mr-2" />
                        Export as CSV
                    </button>
                    <button onClick={exportToJSON} className="export-menu-item">
                        <FiFileText className="inline mr-2" />
                        Export as JSON
                    </button>
                    <button onClick={exportToPDF} className="export-menu-item">
                        <SiMicrosoftexcel className="inline mr-2" />
                        Export as PDF
                    </button>
                </div>
            )}
        </div>
    );
}
