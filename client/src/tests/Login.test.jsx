import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Login from '../pages/Login';
import { BrowserRouter } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Mock dependencies
const mockLogin = vi.fn();
const mockNavigate = vi.fn();

// Mock useNavigate from react-router-dom
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

// Mock useAuth hook
vi.mock('../context/AuthContext', () => ({
    useAuth: vi.fn(),
    AuthProvider: ({ children }) => <div>{children}</div>
}));

// Helper to render
const renderLogin = () => {
    return render(
        <BrowserRouter>
            <Login />
        </BrowserRouter>
    );
};

describe('Login Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default mock implementation
        useAuth.mockReturnValue({
            login: mockLogin,
            user: null,
            loading: false
        });
    });

    it('renders login form correctly', () => {
        renderLogin();
        expect(screen.getByText(/Al Zohra/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/••••••••/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Login/i })).toBeInTheDocument();
    });

    it('handles input changes', () => {
        renderLogin();
        const emailInput = screen.getByPlaceholderText(/you@example.com/i);
        const passwordInput = screen.getByPlaceholderText(/••••••••/i);

        fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
        fireEvent.change(passwordInput, { target: { value: 'password123' } });

        expect(emailInput.value).toBe('test@example.com');
        expect(passwordInput.value).toBe('password123');
    });

    it('submits form with credentials', async () => {
        // Setup mock logic for successful login
        mockLogin.mockResolvedValue({ success: true });

        renderLogin();
        const emailInput = screen.getByPlaceholderText(/you@example.com/i);
        const passwordInput = screen.getByPlaceholderText(/••••••••/i);
        const submitButton = screen.getByRole('button', { name: /Login/i });

        fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
        fireEvent.change(passwordInput, { target: { value: 'password123' } });
        fireEvent.click(submitButton);

        expect(submitButton).toHaveTextContent('Logging in...');

        await waitFor(() => {
            expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
            expect(mockNavigate).toHaveBeenCalledWith('/');
        });
    });

    it('displays error on failed login', async () => {
        // Setup mock logic for failed login
        mockLogin.mockResolvedValue({ success: false, error: 'Invalid credentials' });

        renderLogin();
        const emailInput = screen.getByPlaceholderText(/you@example.com/i);
        const passwordInput = screen.getByPlaceholderText(/••••••••/i);
        const submitButton = screen.getByRole('button', { name: /Login/i });

        fireEvent.change(emailInput, { target: { value: 'wrong@example.com' } });
        fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
        });

        expect(mockNavigate).not.toHaveBeenCalled();
    });
});
