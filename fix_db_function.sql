-- Fix for type mismatch: get_period_status expected DATE but got TIMESTAMP
CREATE OR REPLACE FUNCTION get_period_status(check_date TIMESTAMP WITHOUT TIME ZONE)
RETURNS VARCHAR AS $$
BEGIN
    RETURN get_period_status(check_date::DATE);
END;
$$ LANGUAGE plpgsql;
