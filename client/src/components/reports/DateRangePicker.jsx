import React, { useState } from 'react';
import { FiCalendar } from 'react-icons/fi';

export default function DateRangePicker({ startDate, endDate, onChange }) {
    const [showCustom, setShowCustom] = useState(false);

    const presets = [
        { label: 'Today', days: 0 },
        { label: 'This Week', days: 7 },
        { label: 'This Month', days: 30 },
        { label: 'This Quarter', days: 90 },
        { label: 'This Year', days: 365 },
    ];

    const handlePreset = (days) => {
        const end = new Date();
        const start = new Date();

        if (days === 0) {
            // Today
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
        } else {
            start.setDate(end.getDate() - days);
        }

        onChange({
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0]
        });
        setShowCustom(false);
    };

    const handleCustomChange = (field, value) => {
        onChange({
            startDate: field === 'start' ? value : startDate,
            endDate: field === 'end' ? value : endDate
        });
    };

    return (
        <div className="date-range-picker">
            <div className="preset-buttons">
                {presets.map((preset) => (
                    <button
                        key={preset.label}
                        onClick={() => handlePreset(preset.days)}
                        className="preset-btn"
                    >
                        {preset.label}
                    </button>
                ))}
                <button
                    onClick={() => setShowCustom(!showCustom)}
                    className="preset-btn custom-btn"
                >
                    <FiCalendar className="inline mr-1" />
                    Custom
                </button>
            </div>

            {showCustom && (
                <div className="custom-date-inputs">
                    <div className="date-input-group">
                        <label>Start Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => handleCustomChange('start', e.target.value)}
                            className="date-input"
                        />
                    </div>
                    <div className="date-input-group">
                        <label>End Date</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => handleCustomChange('end', e.target.value)}
                            className="date-input"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
