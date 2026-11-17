import { useEffect, useState } from "react";
import type { useRequiredForm } from "@/components/RequiredForm";
import type { CompletionField } from "@/services/requiredMatchingFields";
import type { PropertyPage } from "@/components/PropertyWizard";
/** Reveal the owning page before measuring/focusing an otherwise mounted but hidden field. */
export function usePropertyWizardValidation(
  form: ReturnType<typeof useRequiredForm>,
  page: PropertyPage,
  setPage: (page: PropertyPage) => void,
) {
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    if (page !== 0 || !pending) return;
    form.focus(pending);
    setPending(null);
  }, [page, pending]);
  return (snapshot?: readonly CompletionField[]) => {
    const missing = form.validate(snapshot, { focus: false });
    if (missing.length) {
      setPage(0);
      setPending(missing[0]);
    }
    return missing;
  };
}
