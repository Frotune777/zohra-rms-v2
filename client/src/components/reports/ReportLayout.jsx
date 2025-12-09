import React from 'react';

export default function ReportLayout({
    title,
    description,
    dateRangePicker,
    exportButtons,
    children
}) {
    return (
        <div className="report-layout">
            {/* Header */}
            <div className="report-header">
                <div className="report-title-section">
                    <h1 className="report-title">{title}</h1>
                    {description && <p className="report-description">{description}</p>}
                </div>

                <div className="report-controls">
                    {dateRangePicker}
                    {exportButtons}
                </div>
            </div>

            {/* Content */}
            <div className="report-content">
                {children}
            </div>
        </div>
    );
}
