import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiHome } from 'react-icons/fi';

const PageHeader = ({
    title,
    showBack = true,
    showHome = true,
    backTo = null,
    actions = null
}) => {
    const navigate = useNavigate();

    const handleBack = () => {
        if (backTo) {
            navigate(backTo);
        } else {
            navigate(-1);
        }
    };

    const handleHome = () => {
        navigate('/dashboard');
    };

    return (
        <div className="glass-panel p-4 mb-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {/* Navigation Buttons */}
                    <div className="flex items-center gap-2">
                        {showBack && (
                            <button
                                onClick={handleBack}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                title="Go Back"
                            >
                                <FiArrowLeft className="text-xl text-gray-300" />
                            </button>
                        )}
                        {showHome && (
                            <button
                                onClick={handleHome}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                title="Go to Dashboard"
                            >
                                <FiHome className="text-xl text-gray-300" />
                            </button>
                        )}
                    </div>

                    {/* Page Title */}
                    <h1 className="text-2xl font-bold text-white">{title}</h1>
                </div>

                {/* Optional Actions */}
                {actions && (
                    <div className="flex items-center gap-2">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PageHeader;
