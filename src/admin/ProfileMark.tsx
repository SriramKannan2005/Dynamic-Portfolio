/** Your profile photo as the admin's logo / avatar; falls back to "SK" if the image fails. */
import { useState } from 'react';

export function ProfileMark({ className = '' }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`logo-mark profile-mark ${className}`} aria-hidden="true">
      {failed ? 'SK' : <img src="/assets/images/profile/profile-96.webp" alt="" width={96} height={96} decoding="async" onError={() => setFailed(true)} />}
    </span>
  );
}
