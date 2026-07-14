"use client";

import { useSearchParams } from "next/navigation";

import { getAdminTransitionNotice } from "@/lib/admin/transition-outcome";

export function AdminTransitionNotice() {
  const searchParams = useSearchParams();
  const notice = getAdminTransitionNotice(searchParams.get("updated"));

  if (!notice) return null;

  return (
    <div className={notice.className} role={notice.role}>
      <strong>{notice.heading}</strong> {notice.detail}
    </div>
  );
}
