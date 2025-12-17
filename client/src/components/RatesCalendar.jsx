import React, { useState, useEffect } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import api from '../utils/api';

const RatesCalendar = ({ onDateSelect, selectedDate }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [ratesData, setRatesData] = useState({});
    const [loading, setLoading] = useState(false);

    // Helper to format date to YYYY-MM-DD string, ensuring local date interpretation
    const formatDate = (date) => {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    useEffect(() => {
        fetchMonthData();
    }, [currentMonth]);

    const fetchMonthData = async () => {
        setLoading(true);
        try {
            const year = currentMonth.getFullYear();
            const month = currentMonth.getMonth();
            // Use formatDate to ensure correct YYYY-MM-DD strings for API
            const startDate = formatDate(new Date(year, month, 1));
            const endDate = formatDate(new Date(year, month + 1, 0));

            const response = await api.get(
                `chicken/rates/calendar?startDate=${startDate}&endDate=${endDate}`
            );

            const dataMap = {};
            response.data.forEach(item => {
                dataMap[item.date] = item.status;
            });
            setRatesData(dataMap);
        } catch (err) {
            console.error('Failed to fetch calendar data:', err);
        } finally {
            setLoading(false);
        }
    };

    const getDaysInMonth = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay(); // 0 for Sunday, 1 for Monday, etc.

        const days = [];

        // Add empty cells for days before the first day of the month
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(null);
        }

        // Add all days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            days.push(day);
        }

        return days;
    };

    const getDateStatus = (day) => {
        if (!day) return null;
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        // Use formatDate for consistency
        const dateStr = formatDate(new Date(year, month, day));
        return ratesData[dateStr] || null;
    };

    const handleDateClick = (day) => {
        if (!day) return;
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        // Use formatDate for consistency
        const dateStr = formatDate(new Date(year, month, day));
        onDateSelect(dateStr);
    };

    const isSelectedDate = (day) => {
        if (!day || !selectedDate) return false;
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        // Use formatDate for consistency
        const dateStr = formatDate(new Date(year, month, day));
        return dateStr === selectedDate;
    };

    const previousMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
    };

    const nextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
    };

    const monthYear = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const days = getDaysInMonth();
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <div className="glass-panel p-3">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <button
                    onClick={previousMonth}
                    className="p-1 hover:bg-white/10 rounded-md transition"
                >
                    <FiChevronLeft className="text-white text-lg" />
                </button>
                <h3 className="text-base font-semibold text-white">{monthYear}</h3>
                <button
                    onClick={nextMonth}
                    className="p-1 hover:bg-white/10 rounded-md transition"
                >
                    <FiChevronRight className="text-white text-lg" />
                </button>
            </div>

            {/* Legend */}
            <div className="flex gap-4 mb-4 text-sm bg-white/5 p-2 rounded-lg">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-white font-medium">Confirmed</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <span className="text-white font-medium">Pending</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                    <span className="text-white font-medium">No Data</span>
                </div>
            </div>

            {/* Week days */}
            <div className="grid grid-cols-7 gap-1 mb-1">
                {weekDays.map(day => (
                    <div key={day} className="text-center text-xs font-semibold text-gray-400 py-0.5">
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar days */}
            {loading ? (
                <div className="text-center py-6 text-gray-400 text-sm">Loading...</div>
            ) : (
                <div className="grid grid-cols-7 gap-1">
                    {days.map((day, index) => {
                        const status = getDateStatus(day);
                        const isSelected = isSelectedDate(day);

                        return (
                            <button
                                key={index}
                                onClick={() => handleDateClick(day)}
                                disabled={!day}
                                className={`
                                    h-8 w-full p-0.5 rounded text-xs font-semibold transition
                                    ${!day ? 'invisible' : ''}
                                    ${isSelected ? 'ring-2 ring-blue-400' : ''}
                                    ${status === 'confirmed' ? 'bg-green-600 text-white hover:bg-green-500' : ''}
                                    ${status === 'pending' ? 'bg-yellow-600 text-white hover:bg-yellow-500' : ''}
                                    ${!status && day ? 'bg-gray-600 text-gray-300 hover:bg-gray-500' : ''}
                                `}
                            >
                                {day}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default RatesCalendar;
