import { redirect } from "next/navigation";

// Transfers are handled by the parent or guardian in the parent app now.
export default function StudentTransferPage() {
  redirect("/student/dashboard");
}
