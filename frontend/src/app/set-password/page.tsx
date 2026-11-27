import { Suspense } from "react";
import { PasswordForm } from "@/components/password-form";

export default function SetPasswordPage() {
  return (
    <Suspense>
      <PasswordForm mode="set" />
    </Suspense>
  );
}
