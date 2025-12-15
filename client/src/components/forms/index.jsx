import React from 'react';

/**
 * Reusable Input component with consistent styling
 */
export const Input = ({
    label,
    error,
    required = false,
    className = '',
    ...props
}) => {
    return (
        <div className="w-full">
            {label && (
                <label className="block text-sm font-medium text-gray-300 mb-2">
                    {label} {required && <span className="text-red-400">*</span>}
                </label>
            )}
            <input
                className={`w-full px-4 py-2 bg-white/5 border ${error ? 'border-red-500' : 'border-white/10'
                    } rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue transition ${className}`}
                {...props}
            />
            {error && <p className="text-red-400 text-sm mt-1">{error}</p>}
        </div>
    );
};

/**
 * Reusable Select component with consistent styling
 */
export const Select = ({
    label,
    options = [],
    error,
    required = false,
    placeholder = 'Select an option',
    className = '',
    ...props
}) => {
    return (
        <div className="w-full">
            {label && (
                <label className="block text-sm font-medium text-gray-300 mb-2">
                    {label} {required && <span className="text-red-400">*</span>}
                </label>
            )}
            <select
                className={`w-full px-4 py-2 bg-white/5 border ${error ? 'border-red-500' : 'border-white/10'
                    } rounded-lg text-white focus:outline-none focus:border-zohra-blue transition ${className}`}
                {...props}
            >
                <option value="" className="bg-gray-800 text-white">
                    {placeholder}
                </option>
                {options.map((opt) => (
                    <option
                        key={opt.value}
                        value={opt.value}
                        className="bg-gray-800 text-white"
                    >
                        {opt.label}
                    </option>
                ))}
            </select>
            {error && <p className="text-red-400 text-sm mt-1">{error}</p>}
        </div>
    );
};

/**
 * Reusable Textarea component with consistent styling
 */
export const Textarea = ({
    label,
    error,
    required = false,
    className = '',
    ...props
}) => {
    return (
        <div className="w-full">
            {label && (
                <label className="block text-sm font-medium text-gray-300 mb-2">
                    {label} {required && <span className="text-red-400">*</span>}
                </label>
            )}
            <textarea
                className={`w-full px-4 py-2 bg-white/5 border ${error ? 'border-red-500' : 'border-white/10'
                    } rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-zohra-blue transition resize-none ${className}`}
                {...props}
            />
            {error && <p className="text-red-400 text-sm mt-1">{error}</p>}
        </div>
    );
};

/**
 * Reusable Button component with loading state
 */
export const Button = ({
    children,
    variant = 'primary',
    loading = false,
    disabled = false,
    className = '',
    ...props
}) => {
    const baseStyles = 'px-4 py-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2';

    const variants = {
        primary: 'bg-zohra-blue hover:bg-blue-600 text-white',
        secondary: 'bg-gray-700 hover:bg-gray-600 text-white border border-white/10',
        danger: 'bg-red-600 hover:bg-red-700 text-white',
        success: 'bg-green-600 hover:bg-green-700 text-white',
    };

    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${className}`}
            disabled={disabled || loading}
            {...props}
        >
            {loading && (
                <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                    />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                </svg>
            )}
            {loading ? 'Processing...' : children}
        </button>
    );
};
