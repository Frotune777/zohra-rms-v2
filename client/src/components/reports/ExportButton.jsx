import React, { useState } from 'react';
import { FiDownload, FiFileText, FiFile } from 'react-icons/fi';
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
                        let value = row[header];
                        if(typeof value === 'string' && /^[\s]*[=+@-]/.test(value)) value = "'" + value;
                        // Escape commas and quotes
                        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || /[\r\n]/.test(value))) {
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
            URL.revokeObjectURL(link.href);

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
            URL.revokeObjectURL(link.href);

            toast.success('JSON exported successfully');
        } catch (error) {
            console.error('Export error:', error);
            toast.error('Failed to export JSON');
        } finally {
            setIsExporting(false);
            setShowMenu(false);
        }
    };

    const exportToPDF = async () => {
        setIsExporting(true);
        try {
            if(!Array.isArray(data) || !data.length){toast.error('No data to export');return;}
            const {reportPdf}=await import('../../utils/reportPdf');
            const blob=await reportPdf(data,reportType || filename || 'Al Zohra Report');
            const link=document.createElement('a');link.href=URL.createObjectURL(blob);
            link.download=filename+'_'+new Date().toISOString().slice(0,10)+'.pdf';link.click();
            setTimeout(()=>URL.revokeObjectURL(link.href),1000);
            toast.success('PDF exported successfully');
        }catch(e){console.error('PDF export error:',e);toast.error('Failed to export PDF');}
        finally{setIsExporting(false);setShowMenu(false);}
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
                        <FiFileText className="inline mr-2" />
                        Export as PDF
                    </button>
                </div>
            )}
        </div>
    );
}
