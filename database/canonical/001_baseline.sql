-- Generated from the verified legacy migration sequence through 047. No business rows.
--
-- PostgreSQL database dump
--


-- Dumped from database version 14.20 (Homebrew)
-- Dumped by pg_dump version 14.20 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET LOCAL search_path = public;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: movement_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.movement_type_enum AS ENUM (
    'ADJ_IN',
    'ADJ_OUT',
    'SALE',
    'PURCHASE',
    'WASTAGE'
);


--
-- Name: transaction_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transaction_status_enum AS ENUM (
    'PENDING',
    'COMPLETED',
    'CANCELLED',
    'REFUNDED'
);


--
-- Name: audit_trigger_func(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_trigger_func() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    old_val JSONB;
    new_val JSONB;
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        old_val = to_jsonb(OLD);
        new_val = to_jsonb(NEW);
    ELSIF (TG_OP = 'DELETE') THEN
        old_val = to_jsonb(OLD);
        new_val = null;
    ELSIF (TG_OP = 'INSERT') THEN
        old_val = null;
        new_val = to_jsonb(NEW);
    END IF;

    -- Insert into Audit Log
    -- Note: changed_by_user_id is hard to get generic from simple trigger without app context setting.
    -- We will leave it null for now or rely on app to set current_setting if implemented.
    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data)
    VALUES (TG_TABLE_NAME, COALESCE(NEW.id::text, OLD.id::text), TG_OP, old_val, new_val);

    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: check_period_open(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_period_open() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    period_status VARCHAR(20);
BEGIN
    -- Check if transaction date falls in a closed period
    SELECT status INTO period_status
    FROM financial_periods
    WHERE NEW.transaction_date >= start_date AND NEW.transaction_date <= end_date
    LIMIT 1;

    -- If period exists and is closed, raise error
    IF (period_status = 'Closed') THEN
        RAISE EXCEPTION 'Financial Period for date % is Closed. Cannot post transaction.', NEW.transaction_date;
    END IF;

    -- If no period defined, we assume it's Open (or strict mode: require period).
    -- For this system, we default to Open to avoid blocking new usage.
    
    RETURN NEW;
END;
$$;


--
-- Name: ensure_period_exists(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_period_exists(for_date date) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    month_start DATE;
    month_end DATE;
    period_name VARCHAR;
BEGIN
    month_start := DATE_TRUNC('month', for_date)::DATE;
    month_end := (DATE_TRUNC('month', for_date) + INTERVAL '1 month - 1 day')::DATE;
    period_name := TO_CHAR(for_date, 'Mon YYYY');
    
    INSERT INTO financial_periods (name, start_date, end_date, status)
    VALUES (period_name, month_start, month_end, 'Open')
    ON CONFLICT DO NOTHING;
END;
$$;


--
-- Name: FUNCTION ensure_period_exists(for_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.ensure_period_exists(for_date date) IS 'Auto-create a financial period for a given date if it doesn''t exist';


--
-- Name: get_attendance_calendar(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_attendance_calendar(p_start_date date, p_end_date date) RETURNS TABLE(date date, total_employees integer, filled_records integer, is_locked boolean, last_updated timestamp without time zone, status character varying)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.date,
        COUNT(DISTINCT e.id)::INTEGER as total_employees,
        COUNT(DISTINCT a.employee_id)::INTEGER as filled_records,
        BOOL_OR(a.is_locked) as is_locked,
        MAX(COALESCE(a.updated_at, a.created_at)) as last_updated,
        CASE 
            WHEN BOOL_OR(a.is_locked) THEN 'locked'::VARCHAR(20)
            WHEN COUNT(DISTINCT a.employee_id) = COUNT(DISTINCT e.id) THEN 'complete'::VARCHAR(20)
            WHEN COUNT(DISTINCT a.employee_id) > 0 THEN 'partial'::VARCHAR(20)
            ELSE 'missing'::VARCHAR(20)
        END as status
    FROM generate_series(p_start_date, p_end_date, '1 day'::interval) AS date_series(date)
    CROSS JOIN (SELECT id FROM employees WHERE status = 'active') e
    LEFT JOIN attendance a ON a.date = date_series.date::DATE AND a.employee_id = e.id
    GROUP BY a.date
    ORDER BY a.date;
END;
$$;


--
-- Name: get_period_status(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_period_status(check_date date) RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    period_status VARCHAR;
BEGIN
    SELECT status INTO period_status
    FROM financial_periods
    WHERE check_date BETWEEN start_date AND end_date
    LIMIT 1;
    
    RETURN COALESCE(period_status, 'Open');
END;
$$;


--
-- Name: FUNCTION get_period_status(check_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_period_status(check_date date) IS 'Get the status of the financial period containing the given date';


--
-- Name: is_day_closed(date, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_day_closed(check_date date, check_type character varying DEFAULT 'Counter'::character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    closure_status VARCHAR;
BEGIN
    SELECT status INTO closure_status 
    FROM daily_balances 
    WHERE date = check_date AND type = check_type;
    
    RETURN COALESCE(closure_status, 'Open') = 'Closed';
END;
$$;


--
-- Name: FUNCTION is_day_closed(check_date date, check_type character varying); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_day_closed(check_date date, check_type character varying) IS 'Check if a specific date is closed for cash transactions';


--
-- Name: update_leave_requests_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_leave_requests_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_payment_modes_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_payment_modes_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: validate_journal_period(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_journal_period() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    period_status VARCHAR;
BEGIN
    period_status := get_period_status(NEW.transaction_date::DATE);
    
    IF period_status IN ('Locked', 'Closed') THEN
        RAISE EXCEPTION 'Cannot create/modify journal entry: Period for % is %', 
            NEW.transaction_date, period_status;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION validate_journal_period(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.validate_journal_period() IS 'Trigger to prevent journal entries in locked/closed periods';


--
-- Name: validate_transaction_date(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_transaction_date() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    payment_mode_lower VARCHAR;
    is_cash_transaction BOOLEAN;
    day_is_closed BOOLEAN;
BEGIN
    -- Determine if this is a cash transaction
    payment_mode_lower := LOWER(COALESCE(NEW.payment_method, NEW.payment_mode, ''));
    is_cash_transaction := payment_mode_lower IN ('cash', 'manager_float');
    
    -- Check if day is closed (only for cash transactions)
    IF is_cash_transaction THEN
        day_is_closed := is_day_closed(NEW.date);
        
        IF day_is_closed THEN
            RAISE EXCEPTION 'Cannot create/modify transaction: Day % is closed', NEW.date;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION validate_transaction_date(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.validate_transaction_date() IS 'Trigger function to prevent transactions on closed days';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: advance_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advance_audit_log (
    id integer NOT NULL,
    advance_request_id integer,
    employee_id integer,
    action character varying(50) NOT NULL,
    new_value jsonb,
    changed_by integer,
    changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: advance_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.advance_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: advance_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.advance_audit_log_id_seq OWNED BY public.advance_audit_log.id;


--
-- Name: advance_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advance_ledger (
    id integer NOT NULL,
    employee_id integer,
    transaction_type character varying(20) NOT NULL,
    amount numeric(10,2) NOT NULL,
    payment_mode character varying(20) DEFAULT 'Cash'::character varying,
    paid_by character varying(100),
    notes text,
    transaction_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    balance_after numeric(10,2) DEFAULT 0,
    salary_advance_id integer,
    repayment_source character varying(50),
    advance_request_id integer,
    approved_by integer,
    approved_at timestamp without time zone,
    journal_entry_id uuid,
    CONSTRAINT advance_ledger_amount_positive CHECK ((amount > (0)::numeric)),
    CONSTRAINT advance_ledger_repayment_source_check CHECK (((repayment_source)::text = ANY ((ARRAY['Payroll'::character varying, 'Manual'::character varying, 'Cash'::character varying, 'Retroactive'::character varying, NULL::character varying])::text[])))
);


--
-- Name: COLUMN advance_ledger.journal_entry_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.advance_ledger.journal_entry_id IS 'Link to journal entry created for this advance transaction';


--
-- Name: advance_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.advance_ledger_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: advance_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.advance_ledger_id_seq OWNED BY public.advance_ledger.id;


--
-- Name: advance_manual_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advance_manual_allocations (
    id bigint NOT NULL,
    advance_request_id integer NOT NULL,
    salary_advance_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    journal_entry_id uuid NOT NULL,
    reversed boolean DEFAULT false NOT NULL,
    CONSTRAINT advance_manual_allocations_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: advance_manual_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.advance_manual_allocations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: advance_manual_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.advance_manual_allocations_id_seq OWNED BY public.advance_manual_allocations.id;


--
-- Name: advance_repayment_reversals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advance_repayment_reversals (
    id bigint NOT NULL,
    advance_request_id integer NOT NULL,
    journal_entry_id uuid NOT NULL,
    reason text NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: advance_repayment_reversals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.advance_repayment_reversals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: advance_repayment_reversals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.advance_repayment_reversals_id_seq OWNED BY public.advance_repayment_reversals.id;


--
-- Name: advance_repayment_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advance_repayment_schedule (
    id integer NOT NULL,
    advance_request_id integer,
    employee_id integer,
    month_number integer NOT NULL,
    due_date date NOT NULL,
    scheduled_amount numeric(10,2) NOT NULL,
    recovered_amount numeric(10,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    CONSTRAINT advance_repayment_schedule_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Partial'::text, 'Paid'::text])))
);


--
-- Name: advance_repayment_schedule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.advance_repayment_schedule_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: advance_repayment_schedule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.advance_repayment_schedule_id_seq OWNED BY public.advance_repayment_schedule.id;


--
-- Name: advance_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advance_requests (
    id integer NOT NULL,
    employee_id integer,
    type character varying(20),
    requested_amount numeric(10,2) NOT NULL,
    reason text,
    payment_mode character varying(50),
    paid_by character varying(100),
    status character varying(20) DEFAULT 'Pending'::character varying,
    requested_by integer,
    requested_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    approved_by integer,
    approved_at timestamp without time zone,
    rejection_reason text,
    urgency character varying(20) DEFAULT 'Normal'::character varying,
    approved_amount numeric(10,2),
    repayment_months integer DEFAULT 3,
    monthly_deduction numeric(10,2),
    CONSTRAINT advance_requests_type_check CHECK (((type)::text = ANY ((ARRAY['Advance'::character varying, 'Repayment'::character varying])::text[])))
);


--
-- Name: advance_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.advance_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: advance_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.advance_requests_id_seq OWNED BY public.advance_requests.id;


--
-- Name: advance_schedule_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advance_schedule_allocations (
    id bigint NOT NULL,
    schedule_id integer NOT NULL,
    journal_entry_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    reversed boolean DEFAULT false NOT NULL,
    CONSTRAINT advance_schedule_allocations_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: advance_schedule_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.advance_schedule_allocations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: advance_schedule_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.advance_schedule_allocations_id_seq OWNED BY public.advance_schedule_allocations.id;


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id integer NOT NULL,
    date date NOT NULL,
    employee_id integer,
    status character varying(20) NOT NULL,
    check_in time without time zone,
    check_out time without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_locked boolean DEFAULT false,
    locked_at timestamp without time zone,
    locked_by integer,
    leave_request_id integer,
    notes text,
    overtime_hours numeric(5,2) DEFAULT 0
);


--
-- Name: attendance_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_audit_log (
    id integer NOT NULL,
    attendance_id integer,
    employee_id integer NOT NULL,
    date date NOT NULL,
    action character varying(50) NOT NULL,
    old_value jsonb,
    new_value jsonb,
    changed_by integer NOT NULL,
    changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    ip_address character varying(45),
    user_agent text,
    CONSTRAINT valid_action CHECK (((action)::text = ANY ((ARRAY['CREATE'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying, 'LOCK'::character varying, 'UNLOCK'::character varying, 'BULK_SAVE'::character varying, 'APPROVE_CHANGE'::character varying, 'REJECT_CHANGE'::character varying])::text[])))
);


--
-- Name: attendance_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_audit_log_id_seq OWNED BY public.attendance_audit_log.id;


--
-- Name: attendance_change_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_change_requests (
    id integer NOT NULL,
    attendance_id integer,
    employee_id integer NOT NULL,
    date date NOT NULL,
    old_status character varying(20) NOT NULL,
    new_status character varying(20) NOT NULL,
    old_overtime_hours numeric(5,2),
    new_overtime_hours numeric(5,2),
    reason text NOT NULL,
    requested_by integer NOT NULL,
    requested_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(20) DEFAULT 'Pending'::character varying,
    reviewed_by integer,
    reviewed_at timestamp without time zone,
    review_notes text,
    CONSTRAINT valid_change_status CHECK (((status)::text = ANY ((ARRAY['Pending'::character varying, 'Approved'::character varying, 'Rejected'::character varying])::text[])))
);


--
-- Name: attendance_change_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_change_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_change_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_change_requests_id_seq OWNED BY public.attendance_change_requests.id;


--
-- Name: attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_id_seq OWNED BY public.attendance.id;


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id integer NOT NULL,
    full_name character varying(100) NOT NULL,
    first_name character varying(50),
    last_name character varying(50),
    "position" character varying(50),
    age integer,
    gender character varying(20),
    phone_number character varying(20),
    role character varying(20) DEFAULT 'staff'::character varying,
    base_salary numeric(12,2) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    employee_code character varying(20),
    govt_id_type character varying(20),
    govt_id_number character varying(50),
    department character varying(50) DEFAULT 'General'::character varying,
    visa_expiry date,
    work_permit_expiry date,
    health_card_expiry date,
    shift_id integer,
    created_by integer,
    updated_by integer,
    updated_at timestamp without time zone DEFAULT now(),
    bank_account_no character varying(50),
    ifsc_code character varying(20),
    payout_method character varying(20) DEFAULT 'Cash'::character varying,
    created_by_user_id integer
);


--
-- Name: leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_requests (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    leave_type character varying(50) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    total_days integer GENERATED ALWAYS AS (((end_date - start_date) + 1)) STORED,
    reason text,
    status character varying(20) DEFAULT 'Pending'::character varying,
    approved_by integer,
    approved_at timestamp without time zone,
    rejection_reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_date_range CHECK ((end_date >= start_date)),
    CONSTRAINT valid_status CHECK (((status)::text = ANY ((ARRAY['Pending'::character varying, 'Approved'::character varying, 'Rejected'::character varying])::text[])))
);


--
-- Name: attendance_with_leaves; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.attendance_with_leaves AS
 SELECT a.id,
    a.date,
    a.employee_id,
    a.status,
    a.check_in,
    a.check_out,
    a.created_at,
    a.is_locked,
    a.locked_at,
    a.locked_by,
    a.leave_request_id,
    a.notes,
    a.overtime_hours,
    e.full_name,
    e.employee_code,
    e."position",
    e.role,
    lr.leave_type,
    lr.status AS leave_status,
    lr.reason AS leave_reason,
        CASE
            WHEN ((lr.id IS NOT NULL) AND ((lr.status)::text = 'Approved'::text)) THEN true
            ELSE false
        END AS is_on_approved_leave,
        CASE
            WHEN ((lr.id IS NOT NULL) AND ((lr.status)::text = 'Pending'::text)) THEN true
            ELSE false
        END AS has_pending_leave
   FROM ((public.attendance a
     JOIN public.employees e ON ((a.employee_id = e.id)))
     LEFT JOIN public.leave_requests lr ON ((a.leave_request_id = lr.id)));


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name character varying(50) NOT NULL,
    record_id text NOT NULL,
    action character varying(10) NOT NULL,
    old_data jsonb,
    new_data jsonb,
    changed_by_user_id integer,
    changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    changed_by integer,
    metadata jsonb
);


--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_accounts (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    account_number character varying(50),
    bank_name character varying(100),
    currency character varying(10) DEFAULT 'INR'::character varying,
    account_code integer,
    current_balance numeric(15,2) DEFAULT 0.00,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: bank_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bank_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bank_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bank_accounts_id_seq OWNED BY public.bank_accounts.id;


--
-- Name: bill_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bill_entries (
    id integer NOT NULL,
    date date NOT NULL,
    supplier_id integer,
    item_name character varying(100) NOT NULL,
    qty numeric(10,2) NOT NULL,
    vendor_rate numeric(10,2) NOT NULL,
    expected_rate numeric(10,2) NOT NULL,
    variance numeric(10,2) NOT NULL,
    status character varying(20) DEFAULT 'Pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    approved_by integer,
    approved_at timestamp without time zone,
    approval_notes text,
    journal_entry_id uuid,
    updated_at timestamp without time zone,
    updated_by integer,
    CONSTRAINT chk_bill_entries_status CHECK (((status)::text = ANY ((ARRAY['Pending'::character varying, 'Approved'::character varying, 'Rejected'::character varying])::text[])))
);


--
-- Name: COLUMN bill_entries.approved_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bill_entries.approved_by IS 'User ID who approved this bill';


--
-- Name: COLUMN bill_entries.approved_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bill_entries.approved_at IS 'Timestamp when bill was approved';


--
-- Name: bill_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bill_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bill_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bill_entries_id_seq OWNED BY public.bill_entries.id;


--
-- Name: chart_of_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chart_of_accounts (
    code integer NOT NULL,
    name character varying(100) NOT NULL,
    type character varying(20) NOT NULL
);


--
-- Name: config_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.config_options (
    id integer NOT NULL,
    category character varying(50) NOT NULL,
    value character varying(255) NOT NULL,
    label character varying(255) NOT NULL,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    created_by integer
);


--
-- Name: TABLE config_options; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.config_options IS 'Centralized configuration for all dropdown options across the system';


--
-- Name: COLUMN config_options.category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.config_options.category IS 'Category/type of configuration (e.g., item_categories, units)';


--
-- Name: COLUMN config_options.value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.config_options.value IS 'Internal value used in code';


--
-- Name: COLUMN config_options.label; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.config_options.label IS 'Display label shown to users';


--
-- Name: COLUMN config_options.display_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.config_options.display_order IS 'Order in which options appear in dropdowns';


--
-- Name: COLUMN config_options.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.config_options.metadata IS 'Additional configuration data as JSON';


--
-- Name: config_options_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.config_options_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: config_options_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.config_options_id_seq OWNED BY public.config_options.id;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    phone character varying(20),
    email character varying(100),
    address text,
    loyalty_points integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- Name: daily_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_balances (
    id integer NOT NULL,
    date date NOT NULL,
    type character varying(20) NOT NULL,
    opening_balance numeric(12,2) DEFAULT 0.00,
    closing_balance numeric(12,2) DEFAULT 0.00,
    actual_closing_balance numeric(12,2),
    status character varying(20) DEFAULT 'Open'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    created_by_user_id integer,
    updated_by_user_id integer,
    closed_by integer,
    closed_at timestamp without time zone,
    variance_je_id uuid,
    reopen_count integer DEFAULT 0,
    account_code integer NOT NULL
);


--
-- Name: COLUMN daily_balances.closed_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_balances.closed_by IS 'User ID who closed this day';


--
-- Name: COLUMN daily_balances.closed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_balances.closed_at IS 'Timestamp when day was closed';


--
-- Name: COLUMN daily_balances.variance_je_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_balances.variance_je_id IS 'Journal entry ID for cash variance posting';


--
-- Name: COLUMN daily_balances.reopen_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_balances.reopen_count IS 'Number of times this day has been reopened (audit trail)';


--
-- Name: daily_balances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.daily_balances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: daily_balances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.daily_balances_id_seq OWNED BY public.daily_balances.id;


--
-- Name: daily_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_rates (
    date date NOT NULL,
    tandoor_rate numeric(10,2) NOT NULL,
    boiler_rate numeric(10,2) NOT NULL,
    egg_rate numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(20) DEFAULT 'pending'::character varying,
    updated_at timestamp without time zone,
    updated_by integer,
    CONSTRAINT chk_daily_rates_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'confirmed'::character varying])::text[])))
);


--
-- Name: COLUMN daily_rates.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_rates.status IS 'Status: pending or confirmed';


--
-- Name: COLUMN daily_rates.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_rates.updated_at IS 'Timestamp of last rate update';


--
-- Name: COLUMN daily_rates.updated_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.daily_rates.updated_by IS 'User ID who last updated the rates';


--
-- Name: employee_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_documents (
    id integer NOT NULL,
    employee_id integer,
    document_type character varying(50) NOT NULL,
    document_number character varying(100),
    expiry_date date,
    file_path text,
    uploaded_at timestamp without time zone DEFAULT now()
);


--
-- Name: employee_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_documents_id_seq OWNED BY public.employee_documents.id;


--
-- Name: employee_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_history (
    id integer NOT NULL,
    employee_id integer,
    field_changed character varying(50),
    old_value text,
    new_value text,
    changed_by character varying(50) DEFAULT 'system_migration'::character varying,
    changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: employee_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_history_id_seq OWNED BY public.employee_history.id;


--
-- Name: employee_salary_structure; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_salary_structure (
    id integer NOT NULL,
    employee_id integer,
    component_id integer,
    amount numeric(12,2) NOT NULL,
    effective_date date DEFAULT CURRENT_DATE
);


--
-- Name: employee_salary_structure_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_salary_structure_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_salary_structure_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_salary_structure_id_seq OWNED BY public.employee_salary_structure.id;


--
-- Name: employees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employees_id_seq OWNED BY public.employees.id;


--
-- Name: expense_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_mappings (
    id integer NOT NULL,
    item_keyword character varying(255) NOT NULL,
    category_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: expense_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.expense_mappings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expense_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.expense_mappings_id_seq OWNED BY public.expense_mappings.id;


--
-- Name: financial_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_periods (
    id integer NOT NULL,
    name character varying(50),
    start_date date NOT NULL,
    end_date date NOT NULL,
    status character varying(20) DEFAULT 'Open'::character varying,
    locked_by integer,
    locked_at timestamp without time zone,
    closed_at timestamp without time zone,
    CONSTRAINT chk_financial_period_status CHECK (((status)::text = ANY ((ARRAY['Open'::character varying, 'Locked'::character varying, 'Closed'::character varying])::text[])))
);


--
-- Name: financial_periods_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.financial_periods_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: financial_periods_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.financial_periods_id_seq OWNED BY public.financial_periods.id;


--
-- Name: imported_source_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.imported_source_rows (
    source_key text NOT NULL,
    target_type text NOT NULL,
    target_id text,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_items (
    id integer NOT NULL,
    name character varying(100),
    stock_qty numeric(10,4) DEFAULT 0,
    unit_cost numeric(10,2) DEFAULT 0,
    unit character varying(10),
    created_by integer,
    updated_by integer,
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id integer,
    stock_value numeric(16,2),
    CONSTRAINT inventory_items_stock_value_check CHECK ((stock_value >= (0)::numeric))
);


--
-- Name: inventory_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inventory_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inventory_items_id_seq OWNED BY public.inventory_items.id;


--
-- Name: inventory_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inventory_item_id integer,
    transaction_type character varying(50) NOT NULL,
    quantity numeric(10,4) NOT NULL,
    unit_cost numeric(10,2),
    reference_id character varying(100),
    reference_type character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    value_change numeric(16,2)
);


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    description text,
    created_by_user_id integer,
    reference_id text,
    reference_type character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: kds_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kds_tickets (
    id integer NOT NULL,
    order_id integer,
    items jsonb,
    status character varying(20) DEFAULT 'Pending'::character varying,
    station character varying(50) DEFAULT 'Kitchen'::character varying,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_by integer
);


--
-- Name: kds_tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kds_tickets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kds_tickets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kds_tickets_id_seq OWNED BY public.kds_tickets.id;


--
-- Name: leave_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leave_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leave_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leave_requests_id_seq OWNED BY public.leave_requests.id;


--
-- Name: ledger_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ledger_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_entry_id uuid,
    account_code integer,
    debit numeric(12,2) DEFAULT 0,
    credit numeric(12,2) DEFAULT 0
);


--
-- Name: markup_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.markup_rules (
    id integer NOT NULL,
    supplier_id integer,
    item_name character varying(100) NOT NULL,
    base_rate_type character varying(50) NOT NULL,
    op1 character varying(5),
    val1 numeric(10,2),
    op2 character varying(5),
    val2 numeric(10,2),
    threshold_val numeric(10,2),
    threshold_op character varying(5) DEFAULT '>'::character varying,
    threshold_markup_op character varying(5),
    threshold_markup_val numeric(10,2),
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer,
    updated_by integer
);


--
-- Name: COLUMN markup_rules.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.markup_rules.updated_at IS 'Tracks when the markup rule was last modified - critical for historical data integrity';


--
-- Name: COLUMN markup_rules.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.markup_rules.created_at IS 'Tracks when the markup rule was created';


--
-- Name: COLUMN markup_rules.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.markup_rules.created_by IS 'User ID who created this rule';


--
-- Name: COLUMN markup_rules.updated_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.markup_rules.updated_by IS 'User ID who last updated this rule';


--
-- Name: markup_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.markup_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: markup_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.markup_rules_id_seq OWNED BY public.markup_rules.id;


--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_items (
    id integer NOT NULL,
    name character varying(100),
    price numeric(10,2),
    category character varying(50),
    created_by integer,
    updated_by integer,
    updated_at timestamp without time zone DEFAULT now(),
    tax_rate_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id integer
);


--
-- Name: menu_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.menu_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: menu_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.menu_items_id_seq OWNED BY public.menu_items.id;


--
-- Name: operation_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operation_keys (
    scope text NOT NULL,
    key text NOT NULL,
    request jsonb NOT NULL,
    response jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer,
    menu_item_id integer,
    item_name character varying(100),
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    total_price numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: order_refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_refunds (
    id bigint NOT NULL,
    order_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    receivable_cancelled numeric(12,2) NOT NULL,
    return_stock boolean NOT NULL,
    reason text NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: order_refunds_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_refunds_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_refunds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_refunds_id_seq OWNED BY public.order_refunds.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    order_number character varying(50),
    total_amount numeric(10,2) NOT NULL,
    payment_mode character varying(20) DEFAULT 'Cash'::character varying,
    status character varying(20) DEFAULT 'Completed'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer,
    customer_id integer,
    order_type text DEFAULT 'Dine In'::text,
    table_number text,
    notes text,
    subtotal numeric(12,2) DEFAULT 0,
    discount_amount numeric(12,2) DEFAULT 0,
    tax_amount numeric(12,2) DEFAULT 0,
    paid_amount numeric(12,2) DEFAULT 0,
    payment_status text DEFAULT 'Paid'::text
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: payment_modes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_modes (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    display_name character varying(100) NOT NULL,
    account_code integer NOT NULL,
    is_active boolean DEFAULT true,
    requires_reference boolean DEFAULT false,
    description text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: payment_modes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_modes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_modes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_modes_id_seq OWNED BY public.payment_modes.id;


--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id integer,
    amount numeric(10,2) NOT NULL,
    payment_method character varying(50) NOT NULL,
    transaction_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(20) DEFAULT 'Completed'::character varying,
    reference_number character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer,
    journal_entry_id uuid,
    idempotency_key text,
    refund_id bigint
);


--
-- Name: payroll_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_audit_log (
    id integer NOT NULL,
    salary_history_id integer,
    employee_id integer,
    action character varying(50) NOT NULL,
    previous_status character varying(20),
    new_status character varying(20),
    performed_by integer,
    performed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    reason text NOT NULL,
    metadata jsonb
);


--
-- Name: TABLE payroll_audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payroll_audit_log IS 'Audit trail for all payroll revert and delete operations';


--
-- Name: COLUMN payroll_audit_log.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payroll_audit_log.metadata IS 'JSON snapshot of the salary_history record before deletion/revert';


--
-- Name: payroll_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payroll_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payroll_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payroll_audit_log_id_seq OWNED BY public.payroll_audit_log.id;


--
-- Name: payroll_recovery_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_recovery_allocations (
    id bigint NOT NULL,
    salary_history_id integer NOT NULL,
    advance_id integer NOT NULL,
    journal_entry_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    reversed boolean DEFAULT false NOT NULL,
    CONSTRAINT payroll_recovery_allocations_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: payroll_recovery_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payroll_recovery_allocations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payroll_recovery_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payroll_recovery_allocations_id_seq OWNED BY public.payroll_recovery_allocations.id;


--
-- Name: payroll_shortfall_settlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_shortfall_settlements (
    id bigint NOT NULL,
    shortfall_id bigint NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_mode text NOT NULL,
    journal_entry_id uuid NOT NULL,
    created_by integer,
    reference text NOT NULL,
    reversed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT payroll_shortfall_settlements_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: payroll_shortfall_settlements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payroll_shortfall_settlements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payroll_shortfall_settlements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payroll_shortfall_settlements_id_seq OWNED BY public.payroll_shortfall_settlements.id;


--
-- Name: payroll_shortfalls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_shortfalls (
    id bigint NOT NULL,
    salary_history_id integer NOT NULL,
    employee_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    settled_amount numeric(12,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'Open'::text NOT NULL,
    journal_entry_id uuid NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT payroll_shortfalls_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payroll_shortfalls_check CHECK (((settled_amount >= (0)::numeric) AND (settled_amount <= amount))),
    CONSTRAINT payroll_shortfalls_status_check CHECK ((status = ANY (ARRAY['Open'::text, 'Settled'::text, 'Reversed'::text])))
);


--
-- Name: payroll_shortfalls_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payroll_shortfalls_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payroll_shortfalls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payroll_shortfalls_id_seq OWNED BY public.payroll_shortfalls.id;


--
-- Name: pos_transaction_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_transaction_items (
    id integer NOT NULL,
    transaction_id integer,
    menu_item_id integer,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    total_price numeric(10,2) NOT NULL,
    kitchen_notes text
);


--
-- Name: pos_transaction_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_transaction_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_transaction_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_transaction_items_id_seq OWNED BY public.pos_transaction_items.id;


--
-- Name: pos_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_transactions (
    id integer NOT NULL,
    transaction_uuid uuid DEFAULT gen_random_uuid(),
    total_amount numeric(10,2) NOT NULL,
    tax_amount numeric(10,2) DEFAULT 0,
    discount_amount numeric(10,2) DEFAULT 0,
    payment_method character varying(50) NOT NULL,
    status public.transaction_status_enum DEFAULT 'PENDING'::public.transaction_status_enum,
    customer_name character varying(100),
    customer_phone character varying(20),
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id integer
);


--
-- Name: pos_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_transactions_id_seq OWNED BY public.pos_transactions.id;


--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_items (
    id integer NOT NULL,
    po_id integer,
    inventory_item_id integer,
    qty_ordered numeric(10,2) NOT NULL,
    qty_received numeric(10,2) DEFAULT 0,
    unit_cost numeric(10,2) NOT NULL
);


--
-- Name: purchase_order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_order_items_id_seq OWNED BY public.purchase_order_items.id;


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id integer NOT NULL,
    supplier_id integer,
    status character varying(20) DEFAULT 'Draft'::character varying,
    total_amount numeric(10,2) DEFAULT 0.00,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchase_orders_id_seq OWNED BY public.purchase_orders.id;


--
-- Name: recipe_ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipe_ingredients (
    menu_item_id integer NOT NULL,
    inventory_item_id integer NOT NULL,
    quantity_required numeric(10,4)
);


--
-- Name: salary_advances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_advances (
    id integer NOT NULL,
    employee_id integer,
    amount numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    balance_remaining numeric(10,2) DEFAULT 0.00,
    status character varying(20) DEFAULT 'Active'::character varying,
    total_repaid numeric(10,2) DEFAULT 0.00,
    recovered_amount numeric(10,2) DEFAULT 0.00,
    is_recovered boolean DEFAULT false,
    advance_request_id integer
);


--
-- Name: salary_advances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salary_advances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salary_advances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salary_advances_id_seq OWNED BY public.salary_advances.id;


--
-- Name: salary_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_components (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    type character varying(20) NOT NULL,
    is_taxable boolean DEFAULT true,
    is_active boolean DEFAULT true
);


--
-- Name: salary_components_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salary_components_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salary_components_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salary_components_id_seq OWNED BY public.salary_components.id;


--
-- Name: salary_components_master; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_components_master (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    type character varying(20) NOT NULL,
    is_active boolean DEFAULT true,
    default_amount numeric(10,2) DEFAULT 0
);


--
-- Name: salary_components_master_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salary_components_master_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salary_components_master_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salary_components_master_id_seq OWNED BY public.salary_components_master.id;


--
-- Name: salary_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_history (
    id integer NOT NULL,
    employee_id integer,
    month integer NOT NULL,
    year integer NOT NULL,
    days_worked numeric(6,2),
    calculated_salary numeric(12,2),
    advance_deduction numeric(12,2) DEFAULT 0,
    net_pay numeric(12,2),
    processed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    manual_adjustment numeric(12,2) DEFAULT 0,
    adjustment_reason text,
    status character varying(20) DEFAULT 'Pending'::character varying,
    allowances jsonb DEFAULT '{}'::jsonb,
    deductions jsonb DEFAULT '{}'::jsonb,
    overtime_hours numeric(5,2) DEFAULT 0,
    overtime_amount numeric(10,2) DEFAULT 0,
    extra_days numeric(5,2) DEFAULT 0,
    extra_day_amount numeric(10,2) DEFAULT 0,
    payment_mode character varying(50),
    payment_date timestamp without time zone,
    paid_by text,
    payslip_url text,
    total_days_in_month integer,
    paid_by_user_id integer,
    paid_leave_days numeric(5,2) DEFAULT 0,
    attendance_missing boolean DEFAULT false
);


--
-- Name: salary_history_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_history_components (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    salary_history_id integer,
    component_name character varying(100) NOT NULL,
    amount numeric(10,2) NOT NULL,
    type character varying(20) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: salary_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salary_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salary_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salary_history_id_seq OWNED BY public.salary_history.id;


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shifts (
    id integer NOT NULL,
    name character varying(50),
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_overnight boolean DEFAULT false
);


--
-- Name: shifts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shifts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shifts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shifts_id_seq OWNED BY public.shifts.id;


--
-- Name: stock_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_adjustments (
    id bigint NOT NULL,
    inventory_item_id integer NOT NULL,
    quantity_change numeric(10,4) NOT NULL,
    quantity_before numeric(10,4) NOT NULL,
    quantity_after numeric(10,4) NOT NULL,
    unit_cost numeric(10,2) NOT NULL,
    reason text NOT NULL,
    journal_entry_id uuid,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    value_change numeric(16,2),
    CONSTRAINT stock_adjustments_quantity_after_check CHECK ((quantity_after >= (0)::numeric)),
    CONSTRAINT stock_adjustments_quantity_change_check CHECK ((quantity_change <> (0)::numeric))
);


--
-- Name: stock_adjustments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_adjustments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_adjustments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_adjustments_id_seq OWNED BY public.stock_adjustments.id;


--
-- Name: stock_corrections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_corrections (
    id bigint NOT NULL,
    source_type text NOT NULL,
    source_id text NOT NULL,
    inventory_item_id integer NOT NULL,
    quantity_change numeric(10,4) NOT NULL,
    value_change numeric(16,2) NOT NULL,
    journal_entry_id uuid,
    reason text NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: stock_corrections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_corrections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_corrections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_corrections_id_seq OWNED BY public.stock_corrections.id;


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id integer NOT NULL,
    inventory_item_id integer,
    movement_type public.movement_type_enum NOT NULL,
    quantity_change numeric(10,4) NOT NULL,
    related_document_id character varying(255),
    details text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id integer
);


--
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_movements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_movements_id_seq OWNED BY public.stock_movements.id;


--
-- Name: stock_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_receipts (
    id bigint NOT NULL,
    inventory_item_id integer NOT NULL,
    source_type text NOT NULL,
    source_id text NOT NULL,
    quantity numeric(10,4) NOT NULL,
    value numeric(16,2) NOT NULL,
    quantity_before numeric(10,4) NOT NULL,
    value_before numeric(16,2) NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT stock_receipts_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT stock_receipts_value_check CHECK ((value >= (0)::numeric))
);


--
-- Name: stock_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_receipts_id_seq OWNED BY public.stock_receipts.id;


--
-- Name: stock_revaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_revaluations (
    id bigint NOT NULL,
    inventory_item_id integer NOT NULL,
    stock_qty numeric(10,4) NOT NULL,
    previous_cost numeric(10,2) NOT NULL,
    new_cost numeric(10,2) NOT NULL,
    value_change numeric(12,2) NOT NULL,
    reason text NOT NULL,
    journal_entry_id uuid,
    created_by integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: stock_revaluations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_revaluations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_revaluations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_revaluations_id_seq OWNED BY public.stock_revaluations.id;


--
-- Name: supplier_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_items (
    id integer NOT NULL,
    supplier_id integer,
    item_code character varying(50),
    item_name character varying(100) NOT NULL,
    default_price numeric(10,2),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: supplier_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supplier_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supplier_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supplier_items_id_seq OWNED BY public.supplier_items.id;


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    phone character varying(20),
    payment_type character varying(50),
    vendor_type character varying(50) NOT NULL,
    markup_required boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by integer,
    updated_by integer,
    updated_at timestamp without time zone DEFAULT now(),
    contact_person character varying(100),
    email character varying(100),
    address text,
    gstin character varying(20),
    category_id integer,
    opening_balance numeric(10,2) DEFAULT 0,
    notes text,
    created_by_user_id integer,
    ledger_account_code integer
);


--
-- Name: COLUMN suppliers.updated_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.suppliers.updated_by IS 'User ID who last updated this record';


--
-- Name: COLUMN suppliers.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.suppliers.updated_at IS 'Timestamp of last update';


--
-- Name: suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.suppliers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: suppliers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.suppliers_id_seq OWNED BY public.suppliers.id;


--
-- Name: tax_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_rates (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    rate_percentage numeric(5,4) NOT NULL,
    account_code integer,
    is_active boolean DEFAULT true
);


--
-- Name: tax_rates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tax_rates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tax_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tax_rates_id_seq OWNED BY public.tax_rates.id;


--
-- Name: transaction_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transaction_categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    type character varying(20) NOT NULL,
    parent_id integer,
    created_at timestamp without time zone DEFAULT now(),
    created_by_user_id integer,
    account_code integer NOT NULL,
    CONSTRAINT chk_expense_expense_account CHECK (((((type)::text = 'Expense'::text) AND (account_code >= 5000)) OR ((type)::text <> 'Expense'::text))),
    CONSTRAINT chk_income_revenue_account CHECK (((((type)::text = 'Income'::text) AND (account_code >= 4000) AND (account_code < 5000)) OR ((type)::text <> 'Income'::text))),
    CONSTRAINT transaction_categories_type_check CHECK (((type)::text = ANY ((ARRAY['Income'::character varying, 'Expense'::character varying])::text[])))
);


--
-- Name: transaction_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transaction_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transaction_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transaction_categories_id_seq OWNED BY public.transaction_categories.id;


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date date NOT NULL,
    type character varying(50) NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_method character varying(50),
    status character varying(20) DEFAULT 'Pending'::character varying,
    description text,
    category_id integer,
    metadata jsonb,
    paid_by character varying(100),
    paid_date date,
    vendor_id integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    mode character varying(50),
    created_by_user_id integer
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(100) NOT NULL,
    role character varying(20) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(20) DEFAULT 'active'::character varying,
    created_by integer,
    updated_by integer,
    updated_at timestamp without time zone DEFAULT now(),
    ledger_account_code integer,
    employee_id integer,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['staff'::character varying, 'manager'::character varying, 'owner'::character varying])::text[])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vendor_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    expense_account_code integer,
    description text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: vendor_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_categories_id_seq OWNED BY public.vendor_categories.id;


--
-- Name: vendor_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_ledger (
    id integer NOT NULL,
    date date NOT NULL,
    supplier_id integer,
    transaction_type character varying(50) NOT NULL,
    amount numeric(12,2) NOT NULL,
    details text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    journal_entry_id uuid,
    created_by integer,
    bill_entry_id integer,
    payment_mode character varying(50),
    reference_number character varying(100),
    category_id integer,
    payment_id integer,
    CONSTRAINT vendor_ledger_amount_positive CHECK ((amount <> (0)::numeric))
);


--
-- Name: vendor_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_ledger_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_ledger_id_seq OWNED BY public.vendor_ledger.id;


--
-- Name: vendor_outstanding; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vendor_outstanding AS
 SELECT s.id AS vendor_id,
    s.name AS vendor_name,
    s.vendor_type,
    s.category_id,
    vc.name AS category_name,
    (COALESCE(s.opening_balance, (0)::numeric) + COALESCE(sum(
        CASE
            WHEN ((vl.transaction_type)::text = ANY ((ARRAY['Bill'::character varying, 'Purchase'::character varying])::text[])) THEN vl.amount
            WHEN ((vl.transaction_type)::text = 'Payment'::text) THEN (- vl.amount)
            ELSE (0)::numeric
        END), (0)::numeric)) AS outstanding_balance,
    count(
        CASE
            WHEN ((vl.transaction_type)::text = ANY ((ARRAY['Bill'::character varying, 'Purchase'::character varying])::text[])) THEN 1
            ELSE NULL::integer
        END) AS total_bills,
    count(
        CASE
            WHEN ((vl.transaction_type)::text = 'Payment'::text) THEN 1
            ELSE NULL::integer
        END) AS total_payments,
    max(vl.date) AS last_transaction_date,
    min(
        CASE
            WHEN ((vl.transaction_type)::text = ANY ((ARRAY['Bill'::character varying, 'Purchase'::character varying])::text[])) THEN vl.date
            ELSE NULL::date
        END) AS oldest_bill_date,
    max(
        CASE
            WHEN ((vl.transaction_type)::text = 'Payment'::text) THEN vl.date
            ELSE NULL::date
        END) AS last_payment_date,
        CASE
            WHEN ((COALESCE(s.opening_balance, (0)::numeric) + COALESCE(sum(
            CASE
                WHEN ((vl.transaction_type)::text = ANY ((ARRAY['Bill'::character varying, 'Purchase'::character varying])::text[])) THEN vl.amount
                WHEN ((vl.transaction_type)::text = 'Payment'::text) THEN (- vl.amount)
                ELSE (0)::numeric
            END), (0)::numeric)) > (0)::numeric) THEN (CURRENT_DATE - min(
            CASE
                WHEN ((vl.transaction_type)::text = ANY ((ARRAY['Bill'::character varying, 'Purchase'::character varying])::text[])) THEN vl.date
                ELSE NULL::date
            END))
            ELSE NULL::integer
        END AS days_outstanding
   FROM ((public.suppliers s
     LEFT JOIN public.vendor_ledger vl ON ((s.id = vl.supplier_id)))
     LEFT JOIN public.vendor_categories vc ON ((s.category_id = vc.id)))
  GROUP BY s.id, s.name, s.vendor_type, s.category_id, vc.name, s.opening_balance;


--
-- Name: vendor_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_payments (
    id integer NOT NULL,
    vendor_id integer NOT NULL,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    amount numeric(10,2) NOT NULL,
    payment_mode character varying(50) NOT NULL,
    reference_number character varying(100),
    notes text NOT NULL,
    paid_by character varying(100) NOT NULL,
    attachment_url text,
    journal_entry_id uuid,
    created_at timestamp without time zone DEFAULT now(),
    created_by integer,
    created_by_user_id integer,
    status text DEFAULT 'Posted'::text NOT NULL,
    CONSTRAINT vendor_payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT vendor_payments_payment_mode_check CHECK (((payment_mode)::text = ANY ((ARRAY['Cash'::character varying, 'UPI'::character varying, 'Bank'::character varying, 'Bank Transfer'::character varying, 'Card'::character varying, 'Cheque'::character varying, 'Credit Adjustment'::character varying])::text[])))
);


--
-- Name: vendor_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vendor_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendor_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vendor_payments_id_seq OWNED BY public.vendor_payments.id;


--
-- Name: wallet_transfer_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_transfer_history (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    journal_entry_id uuid NOT NULL,
    direction text NOT NULL,
    amount numeric(12,2) NOT NULL,
    balance_before numeric(12,2) NOT NULL,
    balance_after numeric(12,2) NOT NULL,
    performed_by integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT wallet_transfer_history_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT wallet_transfer_history_direction_check CHECK ((direction = ANY (ARRAY['In'::text, 'Out'::text])))
);


--
-- Name: wallet_transfer_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallet_transfer_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wallet_transfer_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wallet_transfer_history_id_seq OWNED BY public.wallet_transfer_history.id;


--
-- Name: wastage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wastage_logs (
    id integer NOT NULL,
    inventory_item_id integer,
    qty numeric(10,4) NOT NULL,
    reason character varying(255),
    cost numeric(10,2) NOT NULL,
    reported_by character varying(100),
    created_at timestamp without time zone DEFAULT now(),
    journal_entry_id uuid,
    reported_by_user_id integer
);


--
-- Name: wastage_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wastage_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wastage_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wastage_logs_id_seq OWNED BY public.wastage_logs.id;


--
-- Name: advance_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_audit_log ALTER COLUMN id SET DEFAULT nextval('public.advance_audit_log_id_seq'::regclass);


--
-- Name: advance_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_ledger ALTER COLUMN id SET DEFAULT nextval('public.advance_ledger_id_seq'::regclass);


--
-- Name: advance_manual_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_manual_allocations ALTER COLUMN id SET DEFAULT nextval('public.advance_manual_allocations_id_seq'::regclass);


--
-- Name: advance_repayment_reversals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_repayment_reversals ALTER COLUMN id SET DEFAULT nextval('public.advance_repayment_reversals_id_seq'::regclass);


--
-- Name: advance_repayment_schedule id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_repayment_schedule ALTER COLUMN id SET DEFAULT nextval('public.advance_repayment_schedule_id_seq'::regclass);


--
-- Name: advance_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_requests ALTER COLUMN id SET DEFAULT nextval('public.advance_requests_id_seq'::regclass);


--
-- Name: advance_schedule_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_schedule_allocations ALTER COLUMN id SET DEFAULT nextval('public.advance_schedule_allocations_id_seq'::regclass);


--
-- Name: attendance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance ALTER COLUMN id SET DEFAULT nextval('public.attendance_id_seq'::regclass);


--
-- Name: attendance_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_audit_log ALTER COLUMN id SET DEFAULT nextval('public.attendance_audit_log_id_seq'::regclass);


--
-- Name: attendance_change_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_change_requests ALTER COLUMN id SET DEFAULT nextval('public.attendance_change_requests_id_seq'::regclass);


--
-- Name: bank_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts ALTER COLUMN id SET DEFAULT nextval('public.bank_accounts_id_seq'::regclass);


--
-- Name: bill_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_entries ALTER COLUMN id SET DEFAULT nextval('public.bill_entries_id_seq'::regclass);


--
-- Name: config_options id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_options ALTER COLUMN id SET DEFAULT nextval('public.config_options_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: daily_balances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_balances ALTER COLUMN id SET DEFAULT nextval('public.daily_balances_id_seq'::regclass);


--
-- Name: employee_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_documents ALTER COLUMN id SET DEFAULT nextval('public.employee_documents_id_seq'::regclass);


--
-- Name: employee_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_history ALTER COLUMN id SET DEFAULT nextval('public.employee_history_id_seq'::regclass);


--
-- Name: employee_salary_structure id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_salary_structure ALTER COLUMN id SET DEFAULT nextval('public.employee_salary_structure_id_seq'::regclass);


--
-- Name: employees id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees ALTER COLUMN id SET DEFAULT nextval('public.employees_id_seq'::regclass);


--
-- Name: expense_mappings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_mappings ALTER COLUMN id SET DEFAULT nextval('public.expense_mappings_id_seq'::regclass);


--
-- Name: financial_periods id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods ALTER COLUMN id SET DEFAULT nextval('public.financial_periods_id_seq'::regclass);


--
-- Name: inventory_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items ALTER COLUMN id SET DEFAULT nextval('public.inventory_items_id_seq'::regclass);


--
-- Name: kds_tickets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_tickets ALTER COLUMN id SET DEFAULT nextval('public.kds_tickets_id_seq'::regclass);


--
-- Name: leave_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests ALTER COLUMN id SET DEFAULT nextval('public.leave_requests_id_seq'::regclass);


--
-- Name: markup_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.markup_rules ALTER COLUMN id SET DEFAULT nextval('public.markup_rules_id_seq'::regclass);


--
-- Name: menu_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items ALTER COLUMN id SET DEFAULT nextval('public.menu_items_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: order_refunds id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_refunds ALTER COLUMN id SET DEFAULT nextval('public.order_refunds_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: payment_modes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_modes ALTER COLUMN id SET DEFAULT nextval('public.payment_modes_id_seq'::regclass);


--
-- Name: payroll_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_audit_log ALTER COLUMN id SET DEFAULT nextval('public.payroll_audit_log_id_seq'::regclass);


--
-- Name: payroll_recovery_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_recovery_allocations ALTER COLUMN id SET DEFAULT nextval('public.payroll_recovery_allocations_id_seq'::regclass);


--
-- Name: payroll_shortfall_settlements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_shortfall_settlements ALTER COLUMN id SET DEFAULT nextval('public.payroll_shortfall_settlements_id_seq'::regclass);


--
-- Name: payroll_shortfalls id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_shortfalls ALTER COLUMN id SET DEFAULT nextval('public.payroll_shortfalls_id_seq'::regclass);


--
-- Name: pos_transaction_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_transaction_items ALTER COLUMN id SET DEFAULT nextval('public.pos_transaction_items_id_seq'::regclass);


--
-- Name: pos_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_transactions ALTER COLUMN id SET DEFAULT nextval('public.pos_transactions_id_seq'::regclass);


--
-- Name: purchase_order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items ALTER COLUMN id SET DEFAULT nextval('public.purchase_order_items_id_seq'::regclass);


--
-- Name: purchase_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders ALTER COLUMN id SET DEFAULT nextval('public.purchase_orders_id_seq'::regclass);


--
-- Name: salary_advances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_advances ALTER COLUMN id SET DEFAULT nextval('public.salary_advances_id_seq'::regclass);


--
-- Name: salary_components id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_components ALTER COLUMN id SET DEFAULT nextval('public.salary_components_id_seq'::regclass);


--
-- Name: salary_components_master id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_components_master ALTER COLUMN id SET DEFAULT nextval('public.salary_components_master_id_seq'::regclass);


--
-- Name: salary_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_history ALTER COLUMN id SET DEFAULT nextval('public.salary_history_id_seq'::regclass);


--
-- Name: shifts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts ALTER COLUMN id SET DEFAULT nextval('public.shifts_id_seq'::regclass);


--
-- Name: stock_adjustments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments ALTER COLUMN id SET DEFAULT nextval('public.stock_adjustments_id_seq'::regclass);


--
-- Name: stock_corrections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_corrections ALTER COLUMN id SET DEFAULT nextval('public.stock_corrections_id_seq'::regclass);


--
-- Name: stock_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements ALTER COLUMN id SET DEFAULT nextval('public.stock_movements_id_seq'::regclass);


--
-- Name: stock_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_receipts ALTER COLUMN id SET DEFAULT nextval('public.stock_receipts_id_seq'::regclass);


--
-- Name: stock_revaluations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_revaluations ALTER COLUMN id SET DEFAULT nextval('public.stock_revaluations_id_seq'::regclass);


--
-- Name: supplier_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_items ALTER COLUMN id SET DEFAULT nextval('public.supplier_items_id_seq'::regclass);


--
-- Name: suppliers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers ALTER COLUMN id SET DEFAULT nextval('public.suppliers_id_seq'::regclass);


--
-- Name: tax_rates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_rates ALTER COLUMN id SET DEFAULT nextval('public.tax_rates_id_seq'::regclass);


--
-- Name: transaction_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_categories ALTER COLUMN id SET DEFAULT nextval('public.transaction_categories_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vendor_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_categories ALTER COLUMN id SET DEFAULT nextval('public.vendor_categories_id_seq'::regclass);


--
-- Name: vendor_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_ledger ALTER COLUMN id SET DEFAULT nextval('public.vendor_ledger_id_seq'::regclass);


--
-- Name: vendor_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_payments ALTER COLUMN id SET DEFAULT nextval('public.vendor_payments_id_seq'::regclass);


--
-- Name: wallet_transfer_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transfer_history ALTER COLUMN id SET DEFAULT nextval('public.wallet_transfer_history_id_seq'::regclass);


--
-- Name: wastage_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wastage_logs ALTER COLUMN id SET DEFAULT nextval('public.wastage_logs_id_seq'::regclass);


--
-- Name: advance_audit_log advance_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_audit_log
    ADD CONSTRAINT advance_audit_log_pkey PRIMARY KEY (id);


--
-- Name: advance_ledger advance_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_ledger
    ADD CONSTRAINT advance_ledger_pkey PRIMARY KEY (id);


--
-- Name: advance_manual_allocations advance_manual_allocations_advance_request_id_salary_advanc_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_manual_allocations
    ADD CONSTRAINT advance_manual_allocations_advance_request_id_salary_advanc_key UNIQUE (advance_request_id, salary_advance_id);


--
-- Name: advance_manual_allocations advance_manual_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_manual_allocations
    ADD CONSTRAINT advance_manual_allocations_pkey PRIMARY KEY (id);


--
-- Name: advance_repayment_reversals advance_repayment_reversals_advance_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_repayment_reversals
    ADD CONSTRAINT advance_repayment_reversals_advance_request_id_key UNIQUE (advance_request_id);


--
-- Name: advance_repayment_reversals advance_repayment_reversals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_repayment_reversals
    ADD CONSTRAINT advance_repayment_reversals_pkey PRIMARY KEY (id);


--
-- Name: advance_repayment_schedule advance_repayment_schedule_advance_request_id_month_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_repayment_schedule
    ADD CONSTRAINT advance_repayment_schedule_advance_request_id_month_number_key UNIQUE (advance_request_id, month_number);


--
-- Name: advance_repayment_schedule advance_repayment_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_repayment_schedule
    ADD CONSTRAINT advance_repayment_schedule_pkey PRIMARY KEY (id);


--
-- Name: advance_requests advance_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_requests
    ADD CONSTRAINT advance_requests_pkey PRIMARY KEY (id);


--
-- Name: advance_schedule_allocations advance_schedule_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_schedule_allocations
    ADD CONSTRAINT advance_schedule_allocations_pkey PRIMARY KEY (id);


--
-- Name: attendance_audit_log attendance_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_audit_log
    ADD CONSTRAINT attendance_audit_log_pkey PRIMARY KEY (id);


--
-- Name: attendance_change_requests attendance_change_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_change_requests
    ADD CONSTRAINT attendance_change_requests_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_date_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_date_employee_id_key UNIQUE (date, employee_id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: bill_entries bill_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_entries
    ADD CONSTRAINT bill_entries_pkey PRIMARY KEY (id);


--
-- Name: chart_of_accounts chart_of_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_pkey PRIMARY KEY (code);


--
-- Name: config_options config_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_options
    ADD CONSTRAINT config_options_pkey PRIMARY KEY (id);


--
-- Name: customers customers_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_phone_key UNIQUE (phone);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: daily_balances daily_balances_date_account_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_balances
    ADD CONSTRAINT daily_balances_date_account_key UNIQUE (date, account_code);


--
-- Name: daily_balances daily_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_balances
    ADD CONSTRAINT daily_balances_pkey PRIMARY KEY (id);


--
-- Name: daily_rates daily_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_rates
    ADD CONSTRAINT daily_rates_pkey PRIMARY KEY (date);


--
-- Name: employee_documents employee_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_documents
    ADD CONSTRAINT employee_documents_pkey PRIMARY KEY (id);


--
-- Name: employee_history employee_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_history
    ADD CONSTRAINT employee_history_pkey PRIMARY KEY (id);


--
-- Name: employee_salary_structure employee_salary_structure_employee_id_component_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_salary_structure
    ADD CONSTRAINT employee_salary_structure_employee_id_component_id_key UNIQUE (employee_id, component_id);


--
-- Name: employee_salary_structure employee_salary_structure_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_salary_structure
    ADD CONSTRAINT employee_salary_structure_pkey PRIMARY KEY (id);


--
-- Name: employees employees_employee_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_employee_code_key UNIQUE (employee_code);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: expense_mappings expense_mappings_item_keyword_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_mappings
    ADD CONSTRAINT expense_mappings_item_keyword_key UNIQUE (item_keyword);


--
-- Name: expense_mappings expense_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_mappings
    ADD CONSTRAINT expense_mappings_pkey PRIMARY KEY (id);


--
-- Name: financial_periods financial_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT financial_periods_pkey PRIMARY KEY (id);


--
-- Name: imported_source_rows imported_source_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imported_source_rows
    ADD CONSTRAINT imported_source_rows_pkey PRIMARY KEY (source_key);


--
-- Name: inventory_items inventory_items_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_name_key UNIQUE (name);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_transactions inventory_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: kds_tickets kds_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_tickets
    ADD CONSTRAINT kds_tickets_pkey PRIMARY KEY (id);


--
-- Name: leave_requests leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);


--
-- Name: ledger_lines ledger_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_lines
    ADD CONSTRAINT ledger_lines_pkey PRIMARY KEY (id);


--
-- Name: markup_rules markup_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.markup_rules
    ADD CONSTRAINT markup_rules_pkey PRIMARY KEY (id);


--
-- Name: markup_rules markup_rules_supplier_id_item_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.markup_rules
    ADD CONSTRAINT markup_rules_supplier_id_item_name_key UNIQUE (supplier_id, item_name);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: operation_keys operation_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operation_keys
    ADD CONSTRAINT operation_keys_pkey PRIMARY KEY (scope, key);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_refunds order_refunds_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_refunds
    ADD CONSTRAINT order_refunds_order_id_key UNIQUE (order_id);


--
-- Name: order_refunds order_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_refunds
    ADD CONSTRAINT order_refunds_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payment_modes payment_modes_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_modes
    ADD CONSTRAINT payment_modes_name_key UNIQUE (name);


--
-- Name: payment_modes payment_modes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_modes
    ADD CONSTRAINT payment_modes_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);


--
-- Name: payroll_audit_log payroll_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_audit_log
    ADD CONSTRAINT payroll_audit_log_pkey PRIMARY KEY (id);


--
-- Name: payroll_recovery_allocations payroll_recovery_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_recovery_allocations
    ADD CONSTRAINT payroll_recovery_allocations_pkey PRIMARY KEY (id);


--
-- Name: payroll_shortfall_settlements payroll_shortfall_settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_shortfall_settlements
    ADD CONSTRAINT payroll_shortfall_settlements_pkey PRIMARY KEY (id);


--
-- Name: payroll_shortfall_settlements payroll_shortfall_settlements_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_shortfall_settlements
    ADD CONSTRAINT payroll_shortfall_settlements_reference_key UNIQUE (reference);


--
-- Name: payroll_shortfalls payroll_shortfalls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_shortfalls
    ADD CONSTRAINT payroll_shortfalls_pkey PRIMARY KEY (id);


--
-- Name: pos_transaction_items pos_transaction_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_transaction_items
    ADD CONSTRAINT pos_transaction_items_pkey PRIMARY KEY (id);


--
-- Name: pos_transactions pos_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_transactions
    ADD CONSTRAINT pos_transactions_pkey PRIMARY KEY (id);


--
-- Name: pos_transactions pos_transactions_transaction_uuid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_transactions
    ADD CONSTRAINT pos_transactions_transaction_uuid_key UNIQUE (transaction_uuid);


--
-- Name: purchase_order_items purchase_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: recipe_ingredients recipe_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_pkey PRIMARY KEY (menu_item_id, inventory_item_id);


--
-- Name: salary_advances salary_advances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_advances
    ADD CONSTRAINT salary_advances_pkey PRIMARY KEY (id);


--
-- Name: salary_components_master salary_components_master_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_components_master
    ADD CONSTRAINT salary_components_master_pkey PRIMARY KEY (id);


--
-- Name: salary_components salary_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_components
    ADD CONSTRAINT salary_components_pkey PRIMARY KEY (id);


--
-- Name: salary_history_components salary_history_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_history_components
    ADD CONSTRAINT salary_history_components_pkey PRIMARY KEY (id);


--
-- Name: salary_history salary_history_employee_id_month_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_history
    ADD CONSTRAINT salary_history_employee_id_month_year_key UNIQUE (employee_id, month, year);


--
-- Name: salary_history salary_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_history
    ADD CONSTRAINT salary_history_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: stock_adjustments stock_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_pkey PRIMARY KEY (id);


--
-- Name: stock_corrections stock_corrections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_corrections
    ADD CONSTRAINT stock_corrections_pkey PRIMARY KEY (id);


--
-- Name: stock_corrections stock_corrections_source_type_source_id_inventory_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_corrections
    ADD CONSTRAINT stock_corrections_source_type_source_id_inventory_item_id_key UNIQUE (source_type, source_id, inventory_item_id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: stock_receipts stock_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_receipts
    ADD CONSTRAINT stock_receipts_pkey PRIMARY KEY (id);


--
-- Name: stock_receipts stock_receipts_source_type_source_id_inventory_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_receipts
    ADD CONSTRAINT stock_receipts_source_type_source_id_inventory_item_id_key UNIQUE (source_type, source_id, inventory_item_id);


--
-- Name: stock_revaluations stock_revaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_revaluations
    ADD CONSTRAINT stock_revaluations_pkey PRIMARY KEY (id);


--
-- Name: supplier_items supplier_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_items
    ADD CONSTRAINT supplier_items_pkey PRIMARY KEY (id);


--
-- Name: supplier_items supplier_items_supplier_id_item_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_items
    ADD CONSTRAINT supplier_items_supplier_id_item_name_key UNIQUE (supplier_id, item_name);


--
-- Name: suppliers suppliers_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_name_key UNIQUE (name);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: tax_rates tax_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_rates
    ADD CONSTRAINT tax_rates_pkey PRIMARY KEY (id);


--
-- Name: transaction_categories transaction_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_categories
    ADD CONSTRAINT transaction_categories_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: config_options unique_category_value; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_options
    ADD CONSTRAINT unique_category_value UNIQUE (category, value);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vendor_categories vendor_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_categories
    ADD CONSTRAINT vendor_categories_name_key UNIQUE (name);


--
-- Name: vendor_categories vendor_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_categories
    ADD CONSTRAINT vendor_categories_pkey PRIMARY KEY (id);


--
-- Name: vendor_ledger vendor_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_ledger
    ADD CONSTRAINT vendor_ledger_pkey PRIMARY KEY (id);


--
-- Name: vendor_payments vendor_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_payments
    ADD CONSTRAINT vendor_payments_pkey PRIMARY KEY (id);


--
-- Name: wallet_transfer_history wallet_transfer_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transfer_history
    ADD CONSTRAINT wallet_transfer_history_pkey PRIMARY KEY (id);


--
-- Name: wastage_logs wastage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wastage_logs
    ADD CONSTRAINT wastage_logs_pkey PRIMARY KEY (id);


--
-- Name: idx_advance_ledger_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advance_ledger_date ON public.advance_ledger USING btree (transaction_date);


--
-- Name: idx_advance_ledger_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advance_ledger_employee_id ON public.advance_ledger USING btree (employee_id);


--
-- Name: idx_advance_ledger_employee_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advance_ledger_employee_type ON public.advance_ledger USING btree (employee_id, transaction_type);


--
-- Name: idx_advance_ledger_je; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advance_ledger_je ON public.advance_ledger USING btree (journal_entry_id) WHERE (journal_entry_id IS NOT NULL);


--
-- Name: idx_advance_requests_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advance_requests_employee ON public.advance_requests USING btree (employee_id);


--
-- Name: idx_advance_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advance_requests_status ON public.advance_requests USING btree (status);


--
-- Name: idx_attendance_date_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_date_employee ON public.attendance USING btree (date, employee_id);


--
-- Name: idx_attendance_leave; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_leave ON public.attendance USING btree (leave_request_id);


--
-- Name: idx_attendance_locked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_locked ON public.attendance USING btree (is_locked);


--
-- Name: idx_audit_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_action ON public.attendance_audit_log USING btree (action);


--
-- Name: idx_audit_log_attendance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_attendance ON public.attendance_audit_log USING btree (attendance_id);


--
-- Name: idx_audit_log_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_changed_at ON public.attendance_audit_log USING btree (changed_at DESC);


--
-- Name: idx_audit_log_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_date ON public.attendance_audit_log USING btree (date);


--
-- Name: idx_audit_log_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_employee ON public.attendance_audit_log USING btree (employee_id);


--
-- Name: idx_audit_logs_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_date ON public.audit_logs USING btree (changed_at);


--
-- Name: idx_audit_logs_table_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_table_record ON public.audit_logs USING btree (table_name, record_id);


--
-- Name: idx_bill_entries_date_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bill_entries_date_supplier ON public.bill_entries USING btree (date DESC, supplier_id);


--
-- Name: idx_bill_entries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bill_entries_status ON public.bill_entries USING btree (status);


--
-- Name: idx_bill_entries_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bill_entries_supplier ON public.bill_entries USING btree (supplier_id);


--
-- Name: idx_change_requests_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_change_requests_date ON public.attendance_change_requests USING btree (date);


--
-- Name: idx_change_requests_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_change_requests_employee ON public.attendance_change_requests USING btree (employee_id);


--
-- Name: idx_change_requests_requested; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_change_requests_requested ON public.attendance_change_requests USING btree (requested_at DESC);


--
-- Name: idx_change_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_change_requests_status ON public.attendance_change_requests USING btree (status);


--
-- Name: idx_config_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_active ON public.config_options USING btree (is_active);


--
-- Name: idx_config_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_category ON public.config_options USING btree (category);


--
-- Name: idx_config_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_order ON public.config_options USING btree (category, display_order);


--
-- Name: idx_daily_balances_closed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_balances_closed_by ON public.daily_balances USING btree (closed_by) WHERE (closed_by IS NOT NULL);


--
-- Name: idx_daily_balances_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_balances_created_by ON public.daily_balances USING btree (created_by_user_id);


--
-- Name: idx_daily_balances_status_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_balances_status_date ON public.daily_balances USING btree (status, date);


--
-- Name: idx_daily_balances_updated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_balances_updated_by ON public.daily_balances USING btree (updated_by_user_id);


--
-- Name: idx_daily_rates_date_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_rates_date_desc ON public.daily_rates USING btree (date DESC);


--
-- Name: idx_daily_rates_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_rates_status ON public.daily_rates USING btree (status);


--
-- Name: idx_expense_mappings_keyword; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expense_mappings_keyword ON public.expense_mappings USING btree (item_keyword);


--
-- Name: idx_financial_periods_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_periods_dates ON public.financial_periods USING btree (start_date, end_date);


--
-- Name: idx_financial_periods_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_periods_status ON public.financial_periods USING btree (status);


--
-- Name: idx_inventory_transactions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_transactions_created_at ON public.inventory_transactions USING btree (created_at);


--
-- Name: idx_inventory_transactions_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_transactions_item_id ON public.inventory_transactions USING btree (inventory_item_id);


--
-- Name: idx_journal_entries_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_created_by ON public.journal_entries USING btree (created_by_user_id);


--
-- Name: idx_kds_tickets_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kds_tickets_order ON public.kds_tickets USING btree (order_id);


--
-- Name: idx_leave_requests_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_requests_created ON public.leave_requests USING btree (created_at DESC);


--
-- Name: idx_leave_requests_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_requests_dates ON public.leave_requests USING btree (start_date, end_date);


--
-- Name: idx_leave_requests_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_requests_employee ON public.leave_requests USING btree (employee_id);


--
-- Name: idx_leave_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_requests_status ON public.leave_requests USING btree (status);


--
-- Name: idx_markup_rules_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_markup_rules_supplier ON public.markup_rules USING btree (supplier_id);


--
-- Name: idx_markup_rules_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_markup_rules_updated_at ON public.markup_rules USING btree (updated_at);


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at);


--
-- Name: idx_payment_modes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_modes_active ON public.payment_modes USING btree (is_active);


--
-- Name: idx_payment_modes_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_modes_name ON public.payment_modes USING btree (name);


--
-- Name: idx_payment_transactions_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_transactions_order_id ON public.payment_transactions USING btree (order_id);


--
-- Name: idx_payroll_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_audit_action ON public.payroll_audit_log USING btree (action);


--
-- Name: idx_payroll_audit_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_audit_date ON public.payroll_audit_log USING btree (performed_at);


--
-- Name: idx_payroll_audit_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_audit_employee ON public.payroll_audit_log USING btree (employee_id);


--
-- Name: idx_pos_transactions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_transactions_date ON public.pos_transactions USING btree (created_at);


--
-- Name: idx_pos_transactions_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_transactions_uuid ON public.pos_transactions USING btree (transaction_uuid);


--
-- Name: idx_salary_history_components_history_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_history_components_history_id ON public.salary_history_components USING btree (salary_history_id);


--
-- Name: idx_salary_history_month_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_history_month_year ON public.salary_history USING btree (month, year);


--
-- Name: idx_salary_history_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_history_status ON public.salary_history USING btree (status);


--
-- Name: idx_stock_movements_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_date ON public.stock_movements USING btree (created_at);


--
-- Name: idx_stock_movements_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_item_id ON public.stock_movements USING btree (inventory_item_id);


--
-- Name: idx_transaction_categories_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transaction_categories_account ON public.transaction_categories USING btree (account_code);


--
-- Name: idx_transaction_categories_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transaction_categories_created_by ON public.transaction_categories USING btree (created_by_user_id);


--
-- Name: idx_transactions_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_created_by ON public.transactions USING btree (created_by_user_id);


--
-- Name: idx_transactions_date_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_date_type ON public.transactions USING btree (date, type);


--
-- Name: idx_transactions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_status ON public.transactions USING btree (status, payment_method);


--
-- Name: idx_transactions_vendor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_vendor_id ON public.transactions USING btree (vendor_id);


--
-- Name: idx_users_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_employee_id ON public.users USING btree (employee_id);


--
-- Name: idx_vendor_ledger_bill_entry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_ledger_bill_entry ON public.vendor_ledger USING btree (bill_entry_id);


--
-- Name: idx_vendor_ledger_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_ledger_created_by ON public.vendor_ledger USING btree (created_by);


--
-- Name: idx_vendor_ledger_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_ledger_date ON public.vendor_ledger USING btree (date);


--
-- Name: idx_vendor_ledger_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_ledger_supplier ON public.vendor_ledger USING btree (supplier_id);


--
-- Name: idx_vendor_ledger_supplier_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_ledger_supplier_date ON public.vendor_ledger USING btree (supplier_id, date DESC);


--
-- Name: idx_vendor_ledger_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_ledger_type ON public.vendor_ledger USING btree (transaction_type);


--
-- Name: idx_vendor_payments_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_payments_created_by ON public.vendor_payments USING btree (created_by_user_id);


--
-- Name: idx_vendor_payments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_payments_date ON public.vendor_payments USING btree (payment_date);


--
-- Name: idx_vendor_payments_journal_entry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_payments_journal_entry ON public.vendor_payments USING btree (journal_entry_id);


--
-- Name: idx_vendor_payments_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_payments_mode ON public.vendor_payments USING btree (payment_mode);


--
-- Name: idx_vendor_payments_vendor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_payments_vendor ON public.vendor_payments USING btree (vendor_id);


--
-- Name: idx_wastage_logs_reported_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wastage_logs_reported_by ON public.wastage_logs USING btree (reported_by_user_id);


--
-- Name: kds_one_ticket_per_order; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX kds_one_ticket_per_order ON public.kds_tickets USING btree (order_id);


--
-- Name: order_payment_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX order_payment_retry ON public.payment_transactions USING btree (order_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: payroll_shortfall_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payroll_shortfall_active ON public.payroll_shortfalls USING btree (salary_history_id) WHERE (status <> 'Reversed'::text);


--
-- Name: employees audit_employees; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_employees AFTER INSERT OR DELETE OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();


--
-- Name: menu_items audit_menu_items; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_menu_items AFTER INSERT OR DELETE OR UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();


--
-- Name: suppliers audit_suppliers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_suppliers AFTER INSERT OR DELETE OR UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();


--
-- Name: users audit_users; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_users AFTER INSERT OR DELETE OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();


--
-- Name: journal_entries check_period_journal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER check_period_journal BEFORE INSERT OR UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.check_period_open();


--
-- Name: journal_entries trigger_journal_period_check; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_journal_period_check BEFORE INSERT OR UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.validate_journal_period();


--
-- Name: leave_requests trigger_leave_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_leave_requests_updated_at BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.update_leave_requests_updated_at();


--
-- Name: payment_modes trigger_payment_modes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_payment_modes_updated_at BEFORE UPDATE ON public.payment_modes FOR EACH ROW EXECUTE FUNCTION public.update_payment_modes_updated_at();


--
-- Name: bill_entries update_bill_entries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bill_entries_updated_at BEFORE UPDATE ON public.bill_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: daily_rates update_daily_rates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_daily_rates_updated_at BEFORE UPDATE ON public.daily_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: employees update_employees_modtime; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_employees_modtime BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: employees update_employees_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: inventory_items update_inventory_items_modtime; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_inventory_items_modtime BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: inventory_items update_inventory_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: markup_rules update_markup_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_markup_rules_updated_at BEFORE UPDATE ON public.markup_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: menu_items update_menu_items_modtime; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_menu_items_modtime BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: menu_items update_menu_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: suppliers update_suppliers_modtime; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_suppliers_modtime BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: suppliers update_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_modtime; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_modtime BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: advance_audit_log advance_audit_log_advance_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_audit_log
    ADD CONSTRAINT advance_audit_log_advance_request_id_fkey FOREIGN KEY (advance_request_id) REFERENCES public.advance_requests(id);


--
-- Name: advance_audit_log advance_audit_log_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_audit_log
    ADD CONSTRAINT advance_audit_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);


--
-- Name: advance_audit_log advance_audit_log_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_audit_log
    ADD CONSTRAINT advance_audit_log_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: advance_ledger advance_ledger_advance_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_ledger
    ADD CONSTRAINT advance_ledger_advance_request_id_fkey FOREIGN KEY (advance_request_id) REFERENCES public.advance_requests(id);


--
-- Name: advance_ledger advance_ledger_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_ledger
    ADD CONSTRAINT advance_ledger_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: advance_ledger advance_ledger_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_ledger
    ADD CONSTRAINT advance_ledger_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: advance_ledger advance_ledger_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_ledger
    ADD CONSTRAINT advance_ledger_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: advance_ledger advance_ledger_salary_advance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_ledger
    ADD CONSTRAINT advance_ledger_salary_advance_id_fkey FOREIGN KEY (salary_advance_id) REFERENCES public.salary_advances(id);


--
-- Name: advance_manual_allocations advance_manual_allocations_advance_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_manual_allocations
    ADD CONSTRAINT advance_manual_allocations_advance_request_id_fkey FOREIGN KEY (advance_request_id) REFERENCES public.advance_requests(id);


--
-- Name: advance_manual_allocations advance_manual_allocations_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_manual_allocations
    ADD CONSTRAINT advance_manual_allocations_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: advance_manual_allocations advance_manual_allocations_salary_advance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_manual_allocations
    ADD CONSTRAINT advance_manual_allocations_salary_advance_id_fkey FOREIGN KEY (salary_advance_id) REFERENCES public.salary_advances(id);


--
-- Name: advance_repayment_reversals advance_repayment_reversals_advance_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_repayment_reversals
    ADD CONSTRAINT advance_repayment_reversals_advance_request_id_fkey FOREIGN KEY (advance_request_id) REFERENCES public.advance_requests(id);


--
-- Name: advance_repayment_reversals advance_repayment_reversals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_repayment_reversals
    ADD CONSTRAINT advance_repayment_reversals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: advance_repayment_reversals advance_repayment_reversals_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_repayment_reversals
    ADD CONSTRAINT advance_repayment_reversals_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: advance_repayment_schedule advance_repayment_schedule_advance_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_repayment_schedule
    ADD CONSTRAINT advance_repayment_schedule_advance_request_id_fkey FOREIGN KEY (advance_request_id) REFERENCES public.advance_requests(id);


--
-- Name: advance_repayment_schedule advance_repayment_schedule_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_repayment_schedule
    ADD CONSTRAINT advance_repayment_schedule_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: advance_requests advance_requests_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_requests
    ADD CONSTRAINT advance_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: advance_requests advance_requests_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_requests
    ADD CONSTRAINT advance_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: advance_requests advance_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_requests
    ADD CONSTRAINT advance_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);


--
-- Name: advance_schedule_allocations advance_schedule_allocations_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_schedule_allocations
    ADD CONSTRAINT advance_schedule_allocations_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: advance_schedule_allocations advance_schedule_allocations_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advance_schedule_allocations
    ADD CONSTRAINT advance_schedule_allocations_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.advance_repayment_schedule(id);


--
-- Name: attendance_audit_log attendance_audit_log_attendance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_audit_log
    ADD CONSTRAINT attendance_audit_log_attendance_id_fkey FOREIGN KEY (attendance_id) REFERENCES public.attendance(id) ON DELETE SET NULL;


--
-- Name: attendance_audit_log attendance_audit_log_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_audit_log
    ADD CONSTRAINT attendance_audit_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);


--
-- Name: attendance_change_requests attendance_change_requests_attendance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_change_requests
    ADD CONSTRAINT attendance_change_requests_attendance_id_fkey FOREIGN KEY (attendance_id) REFERENCES public.attendance(id) ON DELETE CASCADE;


--
-- Name: attendance_change_requests attendance_change_requests_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_change_requests
    ADD CONSTRAINT attendance_change_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: attendance_change_requests attendance_change_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_change_requests
    ADD CONSTRAINT attendance_change_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);


--
-- Name: attendance_change_requests attendance_change_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_change_requests
    ADD CONSTRAINT attendance_change_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: attendance attendance_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: attendance attendance_leave_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_leave_request_id_fkey FOREIGN KEY (leave_request_id) REFERENCES public.leave_requests(id) ON DELETE SET NULL;


--
-- Name: attendance attendance_locked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_locked_by_fkey FOREIGN KEY (locked_by) REFERENCES public.users(id);


--
-- Name: audit_logs audit_logs_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id);


--
-- Name: bank_accounts bank_accounts_account_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_account_code_fkey FOREIGN KEY (account_code) REFERENCES public.chart_of_accounts(code);


--
-- Name: bill_entries bill_entries_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_entries
    ADD CONSTRAINT bill_entries_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: bill_entries bill_entries_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_entries
    ADD CONSTRAINT bill_entries_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: bill_entries bill_entries_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_entries
    ADD CONSTRAINT bill_entries_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: bill_entries bill_entries_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_entries
    ADD CONSTRAINT bill_entries_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: config_options config_options_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_options
    ADD CONSTRAINT config_options_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: daily_balances daily_balances_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_balances
    ADD CONSTRAINT daily_balances_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.users(id);


--
-- Name: daily_balances daily_balances_variance_je_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_balances
    ADD CONSTRAINT daily_balances_variance_je_id_fkey FOREIGN KEY (variance_je_id) REFERENCES public.journal_entries(id);


--
-- Name: daily_rates daily_rates_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_rates
    ADD CONSTRAINT daily_rates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: employee_documents employee_documents_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_documents
    ADD CONSTRAINT employee_documents_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_history employee_history_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_history
    ADD CONSTRAINT employee_history_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: employee_salary_structure employee_salary_structure_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_salary_structure
    ADD CONSTRAINT employee_salary_structure_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.salary_components(id);


--
-- Name: employee_salary_structure employee_salary_structure_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_salary_structure
    ADD CONSTRAINT employee_salary_structure_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employees employees_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: employees employees_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: employees employees_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);


--
-- Name: employees employees_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: expense_mappings expense_mappings_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_mappings
    ADD CONSTRAINT expense_mappings_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.transaction_categories(id);


--
-- Name: financial_periods financial_periods_locked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT financial_periods_locked_by_fkey FOREIGN KEY (locked_by) REFERENCES public.users(id);


--
-- Name: daily_balances fk_daily_balances_created_by_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_balances
    ADD CONSTRAINT fk_daily_balances_created_by_user FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: daily_balances fk_daily_balances_updated_by_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_balances
    ADD CONSTRAINT fk_daily_balances_updated_by_user FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: journal_entries fk_journal_entries_created_by_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT fk_journal_entries_created_by_user FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: kds_tickets fk_kds_tickets_order; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_tickets
    ADD CONSTRAINT fk_kds_tickets_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: transaction_categories fk_transaction_categories_created_by_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_categories
    ADD CONSTRAINT fk_transaction_categories_created_by_user FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: transactions fk_transactions_created_by_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT fk_transactions_created_by_user FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: transactions fk_transactions_vendor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT fk_transactions_vendor FOREIGN KEY (vendor_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: vendor_payments fk_vendor_payments_created_by_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_payments
    ADD CONSTRAINT fk_vendor_payments_created_by_user FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: vendor_payments fk_vendor_payments_journal_entry; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_payments
    ADD CONSTRAINT fk_vendor_payments_journal_entry FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: wastage_logs fk_wastage_logs_reported_by_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wastage_logs
    ADD CONSTRAINT fk_wastage_logs_reported_by_user FOREIGN KEY (reported_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: inventory_items inventory_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: inventory_items inventory_items_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: inventory_items inventory_items_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: inventory_transactions inventory_transactions_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);


--
-- Name: kds_tickets kds_tickets_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kds_tickets
    ADD CONSTRAINT kds_tickets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: leave_requests leave_requests_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: leave_requests leave_requests_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: ledger_lines ledger_lines_account_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_lines
    ADD CONSTRAINT ledger_lines_account_code_fkey FOREIGN KEY (account_code) REFERENCES public.chart_of_accounts(code);


--
-- Name: ledger_lines ledger_lines_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_lines
    ADD CONSTRAINT ledger_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: markup_rules markup_rules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.markup_rules
    ADD CONSTRAINT markup_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: markup_rules markup_rules_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.markup_rules
    ADD CONSTRAINT markup_rules_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: markup_rules markup_rules_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.markup_rules
    ADD CONSTRAINT markup_rules_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: menu_items menu_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: menu_items menu_items_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: menu_items menu_items_tax_rate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_tax_rate_id_fkey FOREIGN KEY (tax_rate_id) REFERENCES public.tax_rates(id);


--
-- Name: menu_items menu_items_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: order_items order_items_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id);


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_refunds order_refunds_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_refunds
    ADD CONSTRAINT order_refunds_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: order_refunds order_refunds_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_refunds
    ADD CONSTRAINT order_refunds_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: orders orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: payment_modes payment_modes_account_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_modes
    ADD CONSTRAINT payment_modes_account_code_fkey FOREIGN KEY (account_code) REFERENCES public.chart_of_accounts(code);


--
-- Name: payment_transactions payment_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: payment_transactions payment_transactions_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: payment_transactions payment_transactions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: payment_transactions payment_transactions_refund_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_refund_id_fkey FOREIGN KEY (refund_id) REFERENCES public.order_refunds(id);


--
-- Name: payroll_audit_log payroll_audit_log_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_audit_log
    ADD CONSTRAINT payroll_audit_log_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: payroll_audit_log payroll_audit_log_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_audit_log
    ADD CONSTRAINT payroll_audit_log_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.users(id);


--
-- Name: payroll_recovery_allocations payroll_recovery_allocations_advance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_recovery_allocations
    ADD CONSTRAINT payroll_recovery_allocations_advance_id_fkey FOREIGN KEY (advance_id) REFERENCES public.salary_advances(id);


--
-- Name: payroll_recovery_allocations payroll_recovery_allocations_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_recovery_allocations
    ADD CONSTRAINT payroll_recovery_allocations_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: payroll_shortfall_settlements payroll_shortfall_settlements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_shortfall_settlements
    ADD CONSTRAINT payroll_shortfall_settlements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: payroll_shortfall_settlements payroll_shortfall_settlements_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_shortfall_settlements
    ADD CONSTRAINT payroll_shortfall_settlements_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: payroll_shortfall_settlements payroll_shortfall_settlements_shortfall_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_shortfall_settlements
    ADD CONSTRAINT payroll_shortfall_settlements_shortfall_id_fkey FOREIGN KEY (shortfall_id) REFERENCES public.payroll_shortfalls(id);


--
-- Name: payroll_shortfalls payroll_shortfalls_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_shortfalls
    ADD CONSTRAINT payroll_shortfalls_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: payroll_shortfalls payroll_shortfalls_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_shortfalls
    ADD CONSTRAINT payroll_shortfalls_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: payroll_shortfalls payroll_shortfalls_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_shortfalls
    ADD CONSTRAINT payroll_shortfalls_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: pos_transaction_items pos_transaction_items_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_transaction_items
    ADD CONSTRAINT pos_transaction_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id);


--
-- Name: pos_transaction_items pos_transaction_items_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_transaction_items
    ADD CONSTRAINT pos_transaction_items_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.pos_transactions(id);


--
-- Name: pos_transactions pos_transactions_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_transactions
    ADD CONSTRAINT pos_transactions_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: purchase_order_items purchase_order_items_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);


--
-- Name: purchase_order_items purchase_order_items_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: purchase_orders purchase_orders_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: recipe_ingredients recipe_ingredients_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);


--
-- Name: recipe_ingredients recipe_ingredients_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id);


--
-- Name: salary_advances salary_advances_advance_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_advances
    ADD CONSTRAINT salary_advances_advance_request_id_fkey FOREIGN KEY (advance_request_id) REFERENCES public.advance_requests(id);


--
-- Name: salary_advances salary_advances_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_advances
    ADD CONSTRAINT salary_advances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: salary_history_components salary_history_components_salary_history_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_history_components
    ADD CONSTRAINT salary_history_components_salary_history_id_fkey FOREIGN KEY (salary_history_id) REFERENCES public.salary_history(id) ON DELETE CASCADE;


--
-- Name: salary_history salary_history_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_history
    ADD CONSTRAINT salary_history_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: salary_history salary_history_paid_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_history
    ADD CONSTRAINT salary_history_paid_by_user_id_fkey FOREIGN KEY (paid_by_user_id) REFERENCES public.users(id);


--
-- Name: stock_adjustments stock_adjustments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: stock_adjustments stock_adjustments_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);


--
-- Name: stock_adjustments stock_adjustments_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: stock_corrections stock_corrections_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_corrections
    ADD CONSTRAINT stock_corrections_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: stock_corrections stock_corrections_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_corrections
    ADD CONSTRAINT stock_corrections_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);


--
-- Name: stock_corrections stock_corrections_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_corrections
    ADD CONSTRAINT stock_corrections_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: stock_movements stock_movements_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: stock_movements stock_movements_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);


--
-- Name: stock_receipts stock_receipts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_receipts
    ADD CONSTRAINT stock_receipts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: stock_receipts stock_receipts_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_receipts
    ADD CONSTRAINT stock_receipts_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);


--
-- Name: stock_revaluations stock_revaluations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_revaluations
    ADD CONSTRAINT stock_revaluations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: stock_revaluations stock_revaluations_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_revaluations
    ADD CONSTRAINT stock_revaluations_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);


--
-- Name: stock_revaluations stock_revaluations_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_revaluations
    ADD CONSTRAINT stock_revaluations_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: supplier_items supplier_items_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_items
    ADD CONSTRAINT supplier_items_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: suppliers suppliers_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.vendor_categories(id);


--
-- Name: suppliers suppliers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: suppliers suppliers_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: suppliers suppliers_ledger_account_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_ledger_account_code_fkey FOREIGN KEY (ledger_account_code) REFERENCES public.chart_of_accounts(code);


--
-- Name: suppliers suppliers_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: tax_rates tax_rates_account_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_rates
    ADD CONSTRAINT tax_rates_account_code_fkey FOREIGN KEY (account_code) REFERENCES public.chart_of_accounts(code);


--
-- Name: transaction_categories transaction_categories_account_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_categories
    ADD CONSTRAINT transaction_categories_account_code_fkey FOREIGN KEY (account_code) REFERENCES public.chart_of_accounts(code);


--
-- Name: transaction_categories transaction_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_categories
    ADD CONSTRAINT transaction_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.transaction_categories(id);


--
-- Name: users users_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: users users_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id);


--
-- Name: users users_ledger_account_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_ledger_account_code_fkey FOREIGN KEY (ledger_account_code) REFERENCES public.chart_of_accounts(code);


--
-- Name: users users_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: vendor_categories vendor_categories_expense_account_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_categories
    ADD CONSTRAINT vendor_categories_expense_account_code_fkey FOREIGN KEY (expense_account_code) REFERENCES public.chart_of_accounts(code);


--
-- Name: vendor_ledger vendor_ledger_bill_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_ledger
    ADD CONSTRAINT vendor_ledger_bill_entry_id_fkey FOREIGN KEY (bill_entry_id) REFERENCES public.bill_entries(id) ON DELETE SET NULL;


--
-- Name: vendor_ledger vendor_ledger_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_ledger
    ADD CONSTRAINT vendor_ledger_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.vendor_categories(id);


--
-- Name: vendor_ledger vendor_ledger_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_ledger
    ADD CONSTRAINT vendor_ledger_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: vendor_ledger vendor_ledger_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_ledger
    ADD CONSTRAINT vendor_ledger_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: vendor_ledger vendor_ledger_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_ledger
    ADD CONSTRAINT vendor_ledger_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.vendor_payments(id);


--
-- Name: vendor_ledger vendor_ledger_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_ledger
    ADD CONSTRAINT vendor_ledger_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: vendor_payments vendor_payments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_payments
    ADD CONSTRAINT vendor_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employees(id);


--
-- Name: vendor_payments vendor_payments_vendor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_payments
    ADD CONSTRAINT vendor_payments_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: wallet_transfer_history wallet_transfer_history_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transfer_history
    ADD CONSTRAINT wallet_transfer_history_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- Name: wallet_transfer_history wallet_transfer_history_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transfer_history
    ADD CONSTRAINT wallet_transfer_history_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.users(id);


--
-- Name: wallet_transfer_history wallet_transfer_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transfer_history
    ADD CONSTRAINT wallet_transfer_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: wastage_logs wastage_logs_inventory_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wastage_logs
    ADD CONSTRAINT wastage_logs_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);


--
-- Name: wastage_logs wastage_logs_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wastage_logs
    ADD CONSTRAINT wastage_logs_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);


--
-- PostgreSQL database dump complete
--


