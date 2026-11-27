import { Suspense } from "react";
import { PasswordForm } from "@/components/password-form";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <PasswordForm mode="reset" />
    </Suspense>
  );
}
