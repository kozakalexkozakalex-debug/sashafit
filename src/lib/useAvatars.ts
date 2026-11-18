"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Підписані посилання на фото профілю клієнтів (бакет "avatars" приватний). id → url.
export function useAvatars(clients: { id: string; avatar_path?: string | null }[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = clients.map((c) => `${c.id}:${c.avatar_path ?? ""}`).join("|");

  useEffect(() => {
    const withPhoto = clients.filter((c) => c.avatar_path);
    if (withPhoto.length === 0) {
      setUrls({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage.from("avatars").createSignedUrls(
        withPhoto.map((c) => c.avatar_path as string),
        3600
      );
      if (cancelled || !data) return;
      const map: Record<string, string> = {};
      data.forEach((row, i) => {
        if (row.signedUrl) map[withPhoto[i].id] = row.signedUrl;
      });
      setUrls(map);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}
