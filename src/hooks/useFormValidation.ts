import { useState, useCallback } from "react";
import { z } from "zod";
import type { ValidationErrors } from "@/lib/validations";

/**
 * Hook for real-time form validation with Zod schemas.
 * Returns field-level errors for inline display.
 */
export function useFormValidation<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const [errors, setErrors] = useState<ValidationErrors>({});

  const validateAll = useCallback((data: Record<string, unknown>): boolean => {
    const result = schema.safeParse(data);
    if (result.success) {
      setErrors({});
      return true;
    }
    const newErrors: ValidationErrors = {};
    result.error.errors.forEach((e) => {
      const path = e.path.join(".");
      if (!newErrors[path]) newErrors[path] = e.message;
    });
    setErrors(newErrors);
    return false;
  }, [schema]);

  const validateField = useCallback((field: string, value: unknown, allData?: Record<string, unknown>) => {
    // For individual field validation, try the field's schema
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    if (shape[field]) {
      const result = shape[field].safeParse(value);
      setErrors(prev => {
        const next = { ...prev };
        if (result.success) {
          delete next[field];
        } else {
          next[field] = result.error.errors[0]?.message || "Invalid";
        }
        return next;
      });
    }
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

  return { errors, validateAll, validateField, clearErrors, clearField, getError, hasErrors };
}
