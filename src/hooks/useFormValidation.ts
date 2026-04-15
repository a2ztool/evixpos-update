import { useState, useCallback } from "react";
import { z } from "zod";
import type { ValidationErrors } from "@/lib/validations";

/**
 * Hook for real-time form validation with Zod schemas.
 * Returns field-level errors for inline display.
 */
export function useFormValidation<T extends z.ZodType>(schema: T) {
  const [errors, setErrors] = useState<ValidationErrors>({});

  const validateAll = useCallback((data: unknown): boolean => {
    const result = schema.safeParse(data);
    if (result.success) {
      setErrors({});
      return true;
    }
    const newErrors: ValidationErrors = {};
    const issues = result.error?.issues || [];
    issues.forEach((e) => {
      const path = e.path.join(".");
      if (!newErrors[path]) newErrors[path] = e.message;
    });
    setErrors(newErrors);
    return false;
  }, [schema]);

  const clearErrors = useCallback(() => setErrors({}), []);
  const clearField = useCallback((field: string) => {
    setErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const getError = useCallback((field: string) => errors[field] || "", [errors]);
  const hasErrors = Object.keys(errors).length > 0;

  return { errors, validateAll, clearErrors, clearField, getError, hasErrors };
}
