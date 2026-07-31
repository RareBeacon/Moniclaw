"use client";

import * as React from "react";
import { Loader2, MailPlus, UserMinus } from "lucide-react";
import { useFormState } from "react-dom";

import {
  changeMemberRole,
  inviteMember,
  removeMember,
  revokeInvitation,
  transferOwnership,
  type MembersActionState,
} from "@/lib/actions/members";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: MembersActionState = {};

export function InviteMemberForm() {
  const [state, formAction] = useFormState(inviteMember, initialState);
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state.error) setPending(false);
    if (state.ok) {
      setPending(false);
      setSent(true);
      formRef.current?.reset();
      const t = setTimeout(() => setSent(false), 4000);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => setPending(true)}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="min-w-[220px] flex-1 space-y-2">
        <Label htmlFor="invite-email">Work email</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          placeholder="teammate@company.com"
          required
        />
      </div>
      <div className="w-40 space-y-2">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          name="role"
          defaultValue="MEMBER"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="ADMIN">Admin</option>
          <option value="MANAGER">Manager</option>
          <option value="MEMBER">Member</option>
          <option value="VIEWER">Viewer</option>
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <MailPlus className="h-4 w-4" aria-hidden />
        )}
        Send invite
      </Button>
      <div className="w-full">
        {state.error && (
          <p role="alert" className="text-xs text-destructive">{state.error}</p>
        )}
        {sent && !state.error && (
          <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400">
            Invitation sent. They have 7 days to accept.
          </p>
        )}
      </div>
    </form>
  );
}

export function MemberRowActions({
  memberId,
  memberRole,
  isSelf,
  actorRole,
}: {
  memberId: string;
  memberRole: string;
  isSelf: boolean;
  actorRole: string;
}) {
  const [pending, setPending] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState(false);

  if (isSelf || memberRole === "OWNER") return null;
  const isAdminPlus = actorRole === "ADMIN" || actorRole === "OWNER";

  const act = async (kind: string, fn: () => Promise<MembersActionState>) => {
    setPending(kind);
    setMessage(null);
    const result = await fn();
    setPending(null);
    if (result.error) setMessage(result.error);
    else setConfirmRemove(false);
  };

  if (!isAdminPlus) return null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <select
          aria-label="Change role"
          defaultValue=""
          onChange={(e) =>
            act("role", () => changeMemberRole(memberId, e.target.value))
          }
          disabled={pending !== null}
          className="h-9 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="" disabled>
            {memberRole.charAt(0) + memberRole.slice(1).toLowerCase()} — change…
          </option>
          {["ADMIN", "MANAGER", "MEMBER", "VIEWER"]
            .filter((role) => role !== memberRole)
            .map((role) => (
              <option key={role} value={role}>
                {role.charAt(0) + role.slice(1).toLowerCase()}
              </option>
            ))}
        </select>

        {confirmRemove ? (
          <>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending !== null}
              onClick={() => act("remove", () => removeMember(memberId))}
            >
              {pending === "remove" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={pending !== null}
            onClick={() => setConfirmRemove(true)}
            title="Remove from workspace"
          >
            <UserMinus className="h-3.5 w-3.5" aria-hidden />
          </Button>
        )}

        {actorRole === "OWNER" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending !== null}
            onClick={() => act("transfer", () => transferOwnership(memberId))}
            title="Transfer ownership (you become Admin)"
            className="text-xs text-muted-foreground"
          >
            {pending === "transfer" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              "Make owner"
            )}
          </Button>
        )}
      </div>
      {message && (
        <p role="alert" className="text-[0.7rem] text-destructive">{message}</p>
      )}
    </div>
  );
}

export function RevokeInvitationButton({ invitationId }: { invitationId: string }) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const result = await revokeInvitation(invitationId);
          setPending(false);
          if (result.error) setError(result.error);
        }}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : "Revoke"}
      </Button>
      {error && <p role="alert" className="text-[0.7rem] text-destructive">{error}</p>}
    </div>
  );
}
