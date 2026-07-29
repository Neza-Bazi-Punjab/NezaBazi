"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { site } from "@/lib/site";
import CheckInPanel from "./CheckInPanel";

export type SoloRegistration = {
  id: string;
  profile_id: string;
  full_name: string;
  age: number;
  location: string;
  phone: string;
  email: string;
  years_experience: number;
  horse_name: string | null;
  horse_age: number;
  horse_breed: string;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  created_at: string;
};

export type Team = {
  id: string;
  team_name: string;
  leader_profile_id: string;
  created_at: string;
};

export type TeamMember = {
  id: string;
  team_id: string;
  full_name: string;
  age: number;
  location: string;
  phone: string;
  email: string;
  years_experience: number;
  horse_age: number;
  horse_breed: string;
  is_leader: boolean;
  created_at: string;
};

export type AuditLogEntry = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  details: unknown | null;
  batch_id: string | null;
  created_at: string;
};

export type AuditActor = {
  id: string;
  email: string;
  full_name?: string | null;
  phone?: string | null;
};

type AdminDashboardProps = {
  currentAdminId: string;
  soloRegistrations: SoloRegistration[];
  teams: Team[];
  teamMembers: TeamMember[];
  auditLog: AuditLogEntry[];
  auditActors: AuditActor[];
};

type ActiveTab = "profiles" | "solo" | "team" | "checkin" | "audit";

type AdminProfileUser = {
  id: string;
  email: string;
  role: "admin" | "player";
  created_at: string;
  full_name?: string | null;
  phone?: string | null;
};

type RoleChangeConfirmation = {
  userId: string;
  newRole: "admin" | "player";
  step: 1 | 2;
};

type ProfileDeleteConfirmation = {
  userId: string;
  step: 1 | 2;
};

type LinkedRegistration = {
  id: string;
  type: "solo" | "team_member";
  label: string;
  email: string;
  teamName?: string | null;
};

type EmailSyncDialog = {
  profileUser: AdminProfileUser;
  newEmail: string;
  registrations: LinkedRegistration[];
};

type SoloRegistrationDraft = Partial<
  Omit<SoloRegistration, "age" | "years_experience" | "horse_age"> & {
    age: string;
    years_experience: string;
    horse_age: string;
  }
>;

type TeamMemberDraft = Partial<
  Omit<TeamMember, "age" | "years_experience" | "horse_age"> & {
    age: string;
    years_experience: string;
    horse_age: string;
  }
>;

type EditableRegistrationDraft = SoloRegistrationDraft | TeamMemberDraft;
type EditableRegistrationField =
  | "full_name"
  | "age"
  | "location"
  | "phone"
  | "email"
  | "years_experience"
  | "horse_name"
  | "horse_age"
  | "horse_breed"
  | "emergency_contact_name"
  | "emergency_contact_phone";
type AuditDiffValue = {
  before: unknown;
  after: unknown;
};
type AuditLogItem =
  | {
      type: "entry";
      entry: AuditLogEntry;
    }
  | {
      type: "batch";
      batchId: string;
      entries: AuditLogEntry[];
    };

const editableRegistrationFields: Array<{
  field: EditableRegistrationField;
  label: string;
}> = [
  { field: "full_name", label: "Full name" },
  { field: "age", label: "Age" },
  { field: "location", label: "Location" },
  { field: "phone", label: "Phone number" },
  { field: "email", label: "Email" },
  { field: "years_experience", label: "Years of experience" },
  { field: "horse_age", label: "Horse age" },
  { field: "horse_breed", label: "Horse breed" },
];

const soloEditableRegistrationFields: Array<{
  field: EditableRegistrationField;
  label: string;
}> = [
  ...editableRegistrationFields.slice(0, 6),
  { field: "horse_name", label: "Horse name" },
  ...editableRegistrationFields.slice(6),
  { field: "emergency_contact_name", label: "Emergency contact name" },
  { field: "emergency_contact_phone", label: "Emergency contact phone" },
];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const soloRegisteredDateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "2-digit",
  month: "numeric",
  day: "numeric",
});

const adminTableInputClass =
  "block w-full min-w-0 rounded-lg border border-bronze/20 bg-cream px-2 py-2 text-brown focus:border-bronze focus:outline-none";

function AdminTableText({
  value,
  className = "",
}: {
  value: string | number;
  className?: string;
}) {
  const text = String(value);

  return (
    <span
      className={`block min-w-0 max-w-full truncate ${className}`}
      title={text}
    >
      {text}
    </span>
  );
}

const formatDate = (value: string) => dateFormatter.format(new Date(value));
const formatSoloRegisteredDate = (value: string) =>
  soloRegisteredDateFormatter.format(new Date(value));
const formatAuditDate = (value: string) => new Date(value).toLocaleString();
const formatAuditAction = (action: string) =>
  action
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
const formatAuditLabel = (value: string) =>
  value
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");

const formatAuditTargetTable = (targetTable: string | null) => {
  if (!targetTable) {
    return "Unknown";
  }

  const labels: Record<string, string> = {
    solo_registrations: "Solo Registration",
    teams: "Team",
    team_members: "Team Member",
    profiles: "User",
  };

  return labels[targetTable] ?? targetTable;
};

const shortenId = (value: string | null) => {
  if (!value) {
    return "unknown";
  }

  return value.length > 8 ? `${value.slice(0, 8)}...` : value;
};

const isAuditDetailRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isAuditDiffValue = (value: unknown): value is AuditDiffValue =>
  isAuditDetailRecord(value) && "before" in value && "after" in value;

const isEmptyAuditValue = (value: unknown) =>
  value === null ||
  value === undefined ||
  value === "" ||
  (Array.isArray(value) && value.length === 0) ||
  (isAuditDetailRecord(value) && Object.keys(value).length === 0);

const formatAuditDetailValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !isEmptyAuditValue(item))
      .map((item) => formatAuditDetailValue(item))
      .filter(Boolean)
      .join(", ");
  }

  if (isAuditDetailRecord(value)) {
    return Object.entries(value)
      .filter(([, nestedValue]) => !isEmptyAuditValue(nestedValue))
      .map(
        ([nestedKey, nestedValue]) =>
          `${formatAuditLabel(nestedKey)}: ${formatAuditDetailValue(nestedValue)}`
      )
      .join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
};

const getAuditDetailRows = (details: unknown) => {
  if (!isAuditDetailRecord(details)) {
    return [];
  }

  return Object.entries(details)
    .filter(([key]) => key !== "subject_name")
    .filter(([, value]) => !isEmptyAuditValue(value))
    .map(([key, value]) => ({
      label: formatAuditLabel(key),
      value: isAuditDiffValue(value)
        ? `${formatAuditDetailValue(value.before)} → ${formatAuditDetailValue(
            value.after
          )}`
        : formatAuditDetailValue(value),
    }))
    .filter((row) => row.value !== "");
};

const getAuditSubjectName = (details: unknown) => {
  if (!isAuditDetailRecord(details)) {
    return null;
  }

  const subjectName = details.subject_name;

  if (typeof subjectName === "string" && subjectName.trim() !== "") {
    return subjectName;
  }

  for (const key of ["full_name", "team_name", "email"]) {
    const value = details[key];

    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return null;
};

const getAuditLogItems = (entries: AuditLogEntry[]) => {
  const items: AuditLogItem[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];

    if (!entry.batch_id) {
      items.push({ type: "entry", entry });
      continue;
    }

    const batchEntries = [entry];
    let nextIndex = index + 1;

    while (entries[nextIndex]?.batch_id === entry.batch_id) {
      batchEntries.push(entries[nextIndex]);
      nextIndex += 1;
    }

    items.push({
      type: "batch",
      batchId: entry.batch_id,
      entries: batchEntries,
    });
    index = nextIndex - 1;
  }

  return items;
};

const getEarliestAuditEntry = (entries: AuditLogEntry[]) =>
  entries.reduce((earliestEntry, entry) =>
    new Date(entry.created_at).getTime() < new Date(earliestEntry.created_at).getTime()
      ? entry
      : earliestEntry
  );

const stringifyAuditDetails = (details: unknown) => {
  if (details === null || details === undefined) {
    return "";
  }

  if (typeof details === "string") {
    return details;
  }

  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
};

const matchesPerson = (
  person: Pick<SoloRegistration | TeamMember, "full_name" | "email" | "phone">,
  query: string
) =>
  person.full_name.toLowerCase().includes(query) ||
  person.email.toLowerCase().includes(query) ||
  person.phone.toLowerCase().includes(query);

const matchesSoloRegistration = (registration: SoloRegistration, query: string) =>
  matchesPerson(registration, query) ||
  (registration.horse_name ?? "").toLowerCase().includes(query) ||
  (registration.emergency_contact_name ?? "").toLowerCase().includes(query) ||
  (registration.emergency_contact_phone ?? "").toLowerCase().includes(query);

const linkedRegistrationKey = (registration: Pick<LinkedRegistration, "type" | "id">) =>
  `${registration.type}:${registration.id}`;

const draftValue = (
  draft: EditableRegistrationDraft,
  field: EditableRegistrationField
) => String((draft as Partial<Record<EditableRegistrationField, unknown>>)[field] ?? "").trim();

const getRequiredFieldError = (
  draft: EditableRegistrationDraft,
  ownerLabel?: string,
  fields = editableRegistrationFields
) => {
  const missingField = fields.find(
    ({ field }) => draftValue(draft, field) === ""
  );

  if (!missingField) {
    return null;
  }

  return ownerLabel
    ? `${missingField.label} is required for ${ownerLabel}.`
    : `${missingField.label} is required.`;
};

const getEmailFormatError = (
  draft: EditableRegistrationDraft,
  ownerLabel?: string
) => {
  const email = draftValue(draft, "email");

  if (emailPattern.test(email)) {
    return null;
  }

  return ownerLabel
    ? `Please enter a valid email address for ${ownerLabel}.`
    : "Please enter a valid email address.";
};

const requestRegistrationMutation = async (
  method: "PATCH" | "DELETE",
  body: Record<string, unknown>
) => {
  const response = await fetch("/api/admin/registrations", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as { ok?: boolean; error?: string };

  if (!response.ok) {
    throw new Error(result.error ?? "Unable to update this registration.");
  }
};

export default function AdminDashboard({
  currentAdminId,
  soloRegistrations,
  teams,
  teamMembers,
  auditLog,
  auditActors,
}: AdminDashboardProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>("profiles");
  const [searchQuery, setSearchQuery] = useState("");
  const [profileUsers, setProfileUsers] = useState<AdminProfileUser[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [confirmingRoleChange, setConfirmingRoleChange] =
    useState<RoleChangeConfirmation | null>(null);
  const [savingProfileId, setSavingProfileId] = useState<string | null>(null);
  const [profileRowError, setProfileRowError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileEmailDraft, setProfileEmailDraft] = useState("");
  const [emailSyncDialog, setEmailSyncDialog] = useState<EmailSyncDialog | null>(null);
  const [selectedLinkedRegistrationKeys, setSelectedLinkedRegistrationKeys] = useState<string[]>([]);
  const [emailSyncError, setEmailSyncError] = useState<string | null>(null);
  const [confirmingProfileDelete, setConfirmingProfileDelete] =
    useState<ProfileDeleteConfirmation | null>(null);
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [addAdminSearch, setAddAdminSearch] = useState("");
  const [pendingAddAdminId, setPendingAddAdminId] = useState<string | null>(null);
  const [addAdminError, setAddAdminError] = useState<string | null>(null);
  const [editingSoloId, setEditingSoloId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SoloRegistrationDraft | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [teamNameDraft, setTeamNameDraft] = useState("");
  const [memberDrafts, setMemberDrafts] = useState<Record<string, TeamMemberDraft>>({});
  const [confirmingDeleteTeamId, setConfirmingDeleteTeamId] = useState<string | null>(null);
  const [savingTeamId, setSavingTeamId] = useState<string | null>(null);
  const [teamEditError, setTeamEditError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [auditActorFilter, setAuditActorFilter] = useState("all");
  const [expandedAuditLogId, setExpandedAuditLogId] = useState<string | null>(null);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const loadProfileUsers = useCallback(async () => {
    setProfilesLoading(true);
    setProfilesError(null);

    const response = await fetch("/api/admin/users");
    const result = (await response.json()) as AdminProfileUser[] | { error?: string };

    setProfilesLoading(false);

    if (!response.ok || !Array.isArray(result)) {
      setProfilesError(
        Array.isArray(result) ? "Unable to load profiles." : result.error ?? "Unable to load profiles."
      );
      return;
    }

    setProfileUsers(result);
    setProfilesLoaded(true);
  }, []);

  useEffect(() => {
    if (activeTab === "profiles" && !profilesLoaded && !profilesLoading) {
      const timeoutId = window.setTimeout(() => {
        void loadProfileUsers();
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [activeTab, loadProfileUsers, profilesLoaded, profilesLoading]);

  const startRoleChange = (profileUser: AdminProfileUser) => {
    setConfirmingRoleChange({
      userId: profileUser.id,
      newRole: profileUser.role === "admin" ? "player" : "admin",
      step: 1,
    });
    setEditingProfileId(null);
    setProfileEmailDraft("");
    setConfirmingProfileDelete(null);
    setProfileRowError(null);
  };

  const cancelRoleChange = () => {
    setConfirmingRoleChange(null);
    setProfileRowError(null);
  };

  const confirmRoleChange = async (profileUser: AdminProfileUser) => {
    if (!confirmingRoleChange || confirmingRoleChange.userId !== profileUser.id) {
      return;
    }

    const isSelfDemotion =
      profileUser.id === currentAdminId && confirmingRoleChange.newRole === "player";

    if (isSelfDemotion && confirmingRoleChange.step === 1) {
      setConfirmingRoleChange({ ...confirmingRoleChange, step: 2 });
      return;
    }

    setSavingProfileId(profileUser.id);
    setProfileRowError(null);

    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: profileUser.id,
        newRole: confirmingRoleChange.newRole,
      }),
    });
    const result = (await response.json()) as { ok?: boolean; error?: string };

    setSavingProfileId(null);

    if (!response.ok) {
      setProfileRowError({
        id: profileUser.id,
        message: result.error ?? "Unable to update this profile.",
      });
      return;
    }

    setConfirmingRoleChange(null);
    await loadProfileUsers();
  };

  const startEditingProfile = (profileUser: AdminProfileUser) => {
    setEditingProfileId(profileUser.id);
    setProfileEmailDraft(profileUser.email);
    setConfirmingRoleChange(null);
    setConfirmingProfileDelete(null);
    setProfileRowError(null);
  };

  const cancelEditingProfile = () => {
    setEditingProfileId(null);
    setProfileEmailDraft("");
    setProfileRowError(null);
    setEmailSyncDialog(null);
    setSelectedLinkedRegistrationKeys([]);
    setEmailSyncError(null);
  };

  const commitProfileEmail = async (
    profileUser: AdminProfileUser,
    email: string,
    registrationsToSync: LinkedRegistration[]
  ) => {
    setSavingProfileId(profileUser.id);
    setEmailSyncError(null);
    setProfileRowError(null);

    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: profileUser.id,
        email,
        linkedRegistrationUpdates: registrationsToSync.map((registration) => ({
          id: registration.id,
          type: registration.type,
        })),
      }),
    });
    const result = (await response.json()) as {
      ok?: boolean;
      error?: string;
      warnings?: string[];
    };

    setSavingProfileId(null);

    if (!response.ok) {
      const message =
        typeof result.error === "string" && result.error.trim() !== ""
          ? result.error
          : "Unable to update this email.";

      if (emailSyncDialog) {
        setEmailSyncError(message);
      } else {
        setProfileRowError({
          id: profileUser.id,
          message,
        });
      }
      return;
    }

    setEditingProfileId(null);
    setProfileEmailDraft("");
    setEmailSyncDialog(null);
    setSelectedLinkedRegistrationKeys([]);
    setEmailSyncError(null);

    if (result.warnings && result.warnings.length > 0) {
      setProfileRowError({
        id: profileUser.id,
        message: `Login email updated. ${result.warnings.join(" ")}`,
      });
    }

    await loadProfileUsers();
  };

  const saveProfileEmail = async (profileUser: AdminProfileUser) => {
    const trimmedEmail = profileEmailDraft.trim();

    setProfileRowError(null);
    setEmailSyncError(null);

    if (!emailPattern.test(trimmedEmail)) {
      setProfileRowError({
        id: profileUser.id,
        message: "Please enter a valid email address.",
      });
      return;
    }

    setSavingProfileId(profileUser.id);

    const response = await fetch(
      `/api/admin/users?linkedUserId=${encodeURIComponent(profileUser.id)}`
    );
    const result = (await response.json()) as {
      registrations?: LinkedRegistration[];
      error?: string;
    };

    setSavingProfileId(null);

    if (!response.ok || !Array.isArray(result.registrations)) {
      setProfileRowError({
        id: profileUser.id,
        message: result.error ?? "Unable to check linked registrations.",
      });
      return;
    }

    if (result.registrations.length === 0) {
      await commitProfileEmail(profileUser, trimmedEmail, []);
      return;
    }

    setEmailSyncDialog({
      profileUser,
      newEmail: trimmedEmail,
      registrations: result.registrations,
    });
    setSelectedLinkedRegistrationKeys(
      result.registrations.map((registration) => linkedRegistrationKey(registration))
    );
  };

  const startDeletingProfile = (profileUser: AdminProfileUser) => {
    setConfirmingProfileDelete({ userId: profileUser.id, step: 1 });
    setEditingProfileId(null);
    setProfileEmailDraft("");
    setConfirmingRoleChange(null);
    setProfileRowError(null);
  };

  const cancelDeletingProfile = () => {
    setConfirmingProfileDelete(null);
    setProfileRowError(null);
  };

  const confirmDeleteProfile = async (profileUser: AdminProfileUser) => {
    if (!confirmingProfileDelete || confirmingProfileDelete.userId !== profileUser.id) {
      return;
    }

    const isSelfDelete = profileUser.id === currentAdminId;

    if (isSelfDelete && confirmingProfileDelete.step === 1) {
      setConfirmingProfileDelete({ ...confirmingProfileDelete, step: 2 });
      return;
    }

    setSavingProfileId(profileUser.id);
    setProfileRowError(null);

    const response = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: profileUser.id }),
    });
    const result = (await response.json()) as { ok?: boolean; error?: string };

    setSavingProfileId(null);

    if (!response.ok) {
      setProfileRowError({
        id: profileUser.id,
        message: result.error ?? "Unable to delete this account.",
      });
      return;
    }

    setConfirmingProfileDelete(null);
    await loadProfileUsers();
  };

  const openAddAdminPicker = () => {
    setIsAddAdminOpen(true);
    setAddAdminError(null);
    setPendingAddAdminId(null);
  };

  const closeAddAdminPicker = () => {
    setIsAddAdminOpen(false);
    setAddAdminSearch("");
    setPendingAddAdminId(null);
    setAddAdminError(null);
  };

  const confirmAddAdmin = async (profileUser: AdminProfileUser) => {
    setSavingProfileId(profileUser.id);
    setAddAdminError(null);

    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: profileUser.id,
        newRole: "admin",
      }),
    });
    const result = (await response.json()) as { ok?: boolean; error?: string };

    setSavingProfileId(null);

    if (!response.ok) {
      setAddAdminError(result.error ?? "Unable to promote this user.");
      return;
    }

    closeAddAdminPicker();
    await loadProfileUsers();
  };

  const startEditingSolo = (registration: SoloRegistration) => {
    setEditingSoloId(registration.id);
    setConfirmingDeleteId(null);
    setRowError(null);
    setEditDraft({
      full_name: registration.full_name,
      age: String(registration.age),
      location: registration.location,
      phone: registration.phone,
      email: registration.email,
      years_experience: String(registration.years_experience),
      horse_name: registration.horse_name ?? "",
      horse_age: String(registration.horse_age),
      horse_breed: registration.horse_breed,
      emergency_contact_name: registration.emergency_contact_name ?? "",
      emergency_contact_phone: registration.emergency_contact_phone ?? "",
    });
  };

  const cancelEditingSolo = () => {
    setEditingSoloId(null);
    setEditDraft(null);
    setRowError(null);
  };

  const updateEditDraft = (field: keyof SoloRegistrationDraft, value: string) => {
    setEditDraft((currentDraft) => ({
      ...(currentDraft ?? {}),
      [field]: value,
    }));
  };

  const saveSoloRegistration = async (registrationId: string) => {
    if (!editDraft) {
      return;
    }

    setRowError(null);

    const requiredFieldError = getRequiredFieldError(
      editDraft,
      undefined,
      soloEditableRegistrationFields
    );

    if (requiredFieldError) {
      setRowError({ id: registrationId, message: requiredFieldError });
      return;
    }

    const emailFormatError = getEmailFormatError(editDraft);

    if (emailFormatError) {
      setRowError({ id: registrationId, message: emailFormatError });
      return;
    }

    setSavingId(registrationId);

    const updatedRegistration = {
      full_name: String(editDraft.full_name ?? ""),
      age: Number(editDraft.age),
      location: String(editDraft.location ?? ""),
      phone: String(editDraft.phone ?? ""),
      email: String(editDraft.email ?? ""),
      years_experience: Number(editDraft.years_experience),
      horse_name: String(editDraft.horse_name ?? ""),
      horse_age: Number(editDraft.horse_age),
      horse_breed: String(editDraft.horse_breed ?? ""),
      emergency_contact_name: String(editDraft.emergency_contact_name ?? ""),
      emergency_contact_phone: String(editDraft.emergency_contact_phone ?? ""),
    };

    try {
      await requestRegistrationMutation("PATCH", {
        operation: "edit_solo",
        targetId: registrationId,
        payload: updatedRegistration,
      });
    } catch (error) {
      setSavingId(null);
      setRowError({
        id: registrationId,
        message: error instanceof Error ? error.message : "Unable to update registration.",
      });
      return;
    }

    setSavingId(null);
    setEditingSoloId(null);
    setEditDraft(null);
    router.refresh();
  };

  const startDeletingSolo = (registrationId: string) => {
    setConfirmingDeleteId(registrationId);
    setEditingSoloId(null);
    setEditDraft(null);
    setRowError(null);
  };

  const cancelDeletingSolo = () => {
    setConfirmingDeleteId(null);
    setRowError(null);
  };

  const deleteSoloRegistration = async (registrationId: string) => {
    setSavingId(registrationId);
    setRowError(null);

    try {
      await requestRegistrationMutation("DELETE", {
        operation: "delete_solo",
        targetId: registrationId,
      });
    } catch (error) {
      setSavingId(null);
      setRowError({
        id: registrationId,
        message: error instanceof Error ? error.message : "Unable to delete registration.",
      });
      return;
    }

    setSavingId(null);
    setConfirmingDeleteId(null);
    router.refresh();
  };

  const startEditingTeam = (team: Team, members: TeamMember[]) => {
    setEditingTeamId(team.id);
    setConfirmingDeleteTeamId(null);
    setTeamEditError(null);
    setTeamNameDraft(team.team_name);
    setMemberDrafts(
      members.reduce<Record<string, TeamMemberDraft>>((drafts, member) => {
        drafts[member.id] = {
          full_name: member.full_name,
          age: String(member.age),
          location: member.location,
          phone: member.phone,
          email: member.email,
          years_experience: String(member.years_experience),
          horse_age: String(member.horse_age),
          horse_breed: member.horse_breed,
        };
        return drafts;
      }, {})
    );
  };

  const cancelEditingTeam = () => {
    setEditingTeamId(null);
    setTeamNameDraft("");
    setMemberDrafts({});
    setTeamEditError(null);
  };

  const updateMemberDraft = (
    memberId: string,
    field: keyof TeamMemberDraft,
    value: string
  ) => {
    setMemberDrafts((currentDrafts) => ({
      ...currentDrafts,
      [memberId]: {
        ...(currentDrafts[memberId] ?? {}),
        [field]: value,
      },
    }));
  };

  const saveTeamRegistration = async (team: Team, members: TeamMember[]) => {
    setTeamEditError(null);

    if (teamNameDraft.trim() === "") {
      setTeamEditError({ id: team.id, message: "Team name is required." });
      return;
    }

    for (const member of members) {
      const draft = memberDrafts[member.id];
      const ownerLabel =
        draftValue(draft ?? {}, "full_name") || member.full_name || "a team member";

      if (!draft) {
        setTeamEditError({
          id: team.id,
          message: `Missing draft values for ${ownerLabel}.`,
        });
        return;
      }

      const requiredFieldError = getRequiredFieldError(draft, ownerLabel);

      if (requiredFieldError) {
        setTeamEditError({ id: team.id, message: requiredFieldError });
        return;
      }

      const emailFormatError = getEmailFormatError(draft, ownerLabel);

      if (emailFormatError) {
        setTeamEditError({ id: team.id, message: emailFormatError });
        return;
      }
    }

    setSavingTeamId(team.id);

    const trimmedTeamName = teamNameDraft.trim();
    const updatedMembers = members.map((member) => {
      const draft = memberDrafts[member.id]!;

      return {
        id: member.id,
        full_name: String(draft.full_name ?? ""),
        age: Number(draft.age),
        location: String(draft.location ?? ""),
        phone: String(draft.phone ?? ""),
        email: String(draft.email ?? ""),
        years_experience: Number(draft.years_experience),
        horse_age: Number(draft.horse_age),
        horse_breed: String(draft.horse_breed ?? ""),
      };
    });

    try {
      await requestRegistrationMutation("PATCH", {
        operation: "edit_team",
        targetId: team.id,
        payload: {
          team_name: trimmedTeamName,
          members: updatedMembers,
        },
      });
    } catch (error) {
      setSavingTeamId(null);
      setTeamEditError({
        id: team.id,
        message: error instanceof Error ? error.message : "Unable to update this team.",
      });
      return;
    }

    setSavingTeamId(null);
    setEditingTeamId(null);
    setTeamNameDraft("");
    setMemberDrafts({});
    router.refresh();
  };

  const startDeletingTeam = (teamId: string) => {
    setConfirmingDeleteTeamId(teamId);
    setEditingTeamId(null);
    setTeamNameDraft("");
    setMemberDrafts({});
    setTeamEditError(null);
  };

  const cancelDeletingTeam = () => {
    setConfirmingDeleteTeamId(null);
    setTeamEditError(null);
  };

  const deleteTeamRegistration = async (teamId: string) => {
    setSavingTeamId(teamId);
    setTeamEditError(null);

    try {
      await requestRegistrationMutation("DELETE", {
        operation: "delete_team",
        targetId: teamId,
      });
    } catch (error) {
      setSavingTeamId(null);
      setTeamEditError({
        id: teamId,
        message: error instanceof Error ? error.message : "Unable to delete this team.",
      });
      return;
    }

    setSavingTeamId(null);
    setConfirmingDeleteTeamId(null);
    router.refresh();
  };

  const teamMembersByTeamId = useMemo(
    () =>
      teamMembers.reduce<Record<string, TeamMember[]>>((groups, member) => {
        groups[member.team_id] = [...(groups[member.team_id] ?? []), member];
        return groups;
      }, {}),
    [teamMembers]
  );

  const filteredSoloRegistrations = useMemo(
    () =>
      normalizedQuery
        ? soloRegistrations.filter((registration) =>
            matchesSoloRegistration(registration, normalizedQuery)
          )
        : soloRegistrations,
    [normalizedQuery, soloRegistrations]
  );

  const filteredTeams = useMemo(
    () =>
      normalizedQuery
        ? teams.filter((team) => {
            const members = teamMembersByTeamId[team.id] ?? [];
            return (
              team.team_name.toLowerCase().includes(normalizedQuery) ||
              members.some((member) => matchesPerson(member, normalizedQuery))
            );
          })
        : teams,
    [normalizedQuery, teamMembersByTeamId, teams]
  );

  const adminProfileUsers = useMemo(
    () => profileUsers.filter((profileUser) => profileUser.role === "admin"),
    [profileUsers]
  );

  const nonAdminProfileUsers = useMemo(
    () => profileUsers.filter((profileUser) => profileUser.role !== "admin"),
    [profileUsers]
  );

  const filteredAdminProfileUsers = useMemo(
    () =>
      normalizedQuery
        ? adminProfileUsers.filter(
            (profileUser) =>
              profileUser.email.toLowerCase().includes(normalizedQuery) ||
              (profileUser.full_name ?? "").toLowerCase().includes(normalizedQuery) ||
              (profileUser.phone ?? "").toLowerCase().includes(normalizedQuery)
          )
        : adminProfileUsers,
    [adminProfileUsers, normalizedQuery]
  );

  const filteredAddAdminUsers = useMemo(() => {
    const normalizedAddAdminSearch = addAdminSearch.trim().toLowerCase();

    return normalizedAddAdminSearch
      ? nonAdminProfileUsers.filter((profileUser) =>
          profileUser.email.toLowerCase().includes(normalizedAddAdminSearch)
        )
      : nonAdminProfileUsers;
  }, [addAdminSearch, nonAdminProfileUsers]);

  const auditActorById = useMemo(
    () => new Map(auditActors.map((actor) => [actor.id, actor])),
    [auditActors]
  );

  const getAuditActorLabel = useCallback(
    (actorId: string | null, actorName?: string | null, actorEmail?: string | null) => {
      if (!actorId) {
        return actorName || actorEmail || "Deleted admin";
      }

      const actor = auditActorById.get(actorId);
      return actor?.full_name || actor?.email || actorName || actorEmail || actorId;
    },
    [auditActorById]
  );

  const getAuditTargetLabel = useCallback(
    (targetTable: string | null, targetId: string | null, details: unknown) => {
      const tableLabel = formatAuditTargetTable(targetTable);
      const subjectName = getAuditSubjectName(details);

      if (targetTable === "profiles") {
        const actor = targetId ? auditActorById.get(targetId) : null;
        return `${tableLabel} (${
          subjectName || actor?.full_name || actor?.email || shortenId(targetId)
        })`;
      }

      return `${tableLabel} (${subjectName || shortenId(targetId)})`;
    },
    [auditActorById]
  );

  const auditActionOptions = useMemo(
    () => Array.from(new Set(auditLog.map((entry) => entry.action))).sort(),
    [auditLog]
  );

  const auditActorOptions = useMemo(
    () =>
      Array.from(new Set(auditLog.map((entry) => entry.actor_id).filter(Boolean)))
        .map((actorId) => actorId as string)
        .sort((firstActorId, secondActorId) =>
          getAuditActorLabel(firstActorId).localeCompare(
            getAuditActorLabel(secondActorId)
          )
        ),
    [auditLog, getAuditActorLabel]
  );

  const filteredAuditLog = useMemo(
    () =>
      auditLog.filter((entry) => {
        if (auditActionFilter !== "all" && entry.action !== auditActionFilter) {
          return false;
        }

        if (auditActorFilter !== "all" && entry.actor_id !== auditActorFilter) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const actorLabel = getAuditActorLabel(
          entry.actor_id,
          entry.actor_name,
          entry.actor_email
        );
        const searchableText = [
          entry.action,
          formatAuditAction(entry.action),
          entry.target_table,
          entry.target_id,
          actorLabel,
          stringifyAuditDetails(entry.details),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedQuery);
      }),
    [
      auditActionFilter,
      auditActorFilter,
      auditLog,
      getAuditActorLabel,
      normalizedQuery,
    ]
  );

  const auditLogItems = useMemo(
    () => getAuditLogItems(filteredAuditLog),
    [filteredAuditLog]
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-bronze/20 pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setActiveTab("profiles")}
            className={`rounded-lg px-5 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] transition-colors ${
              activeTab === "profiles"
                ? "bg-bronze-deep text-cream hover:bg-bronze"
                : "border border-bronze/20 text-bronze-dark hover:border-bronze/40"
            }`}
          >
            Profiles
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("solo")}
            className={`rounded-lg px-5 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] transition-colors ${
              activeTab === "solo"
                ? "bg-bronze-deep text-cream hover:bg-bronze"
                : "border border-bronze/20 text-bronze-dark hover:border-bronze/40"
            }`}
          >
            Solo Registrations
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("team")}
            className={`rounded-lg px-5 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] transition-colors ${
              activeTab === "team"
                ? "bg-bronze-deep text-cream hover:bg-bronze"
                : "border border-bronze/20 text-bronze-dark hover:border-bronze/40"
            }`}
          >
            Team Registrations
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("checkin")}
            className={`rounded-lg px-5 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] transition-colors ${
              activeTab === "checkin"
                ? "bg-bronze-deep text-cream hover:bg-bronze"
                : "border border-bronze/20 text-bronze-dark hover:border-bronze/40"
            }`}
          >
            Check-in
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("audit")}
            className={`rounded-lg px-5 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] transition-colors ${
              activeTab === "audit"
                ? "bg-bronze-deep text-cream hover:bg-bronze"
                : "border border-bronze/20 text-bronze-dark hover:border-bronze/40"
            }`}
          >
            Audit Log
          </button>
        </div>

        <div className="font-display text-sm font-semibold uppercase tracking-[0.15em] text-brown/70">
          {soloRegistrations.length} solo registrations · {teams.length} teams registered ·{" "}
          {auditLog.length} audit entries
        </div>
      </div>

      {/* Check-in has its own code field and searches every rider server-side,
          so the table filter would only be confusing there. */}
      {activeTab !== "checkin" && (
        <div>
          <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
            Search
          </label>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={
              activeTab === "audit"
                ? "Search by action, admin, target, or details..."
                : "Search by name, email, or phone..."
            }
            className="mt-2 w-full rounded-lg border border-bronze/20 bg-sand px-4 py-3 text-brown focus:border-bronze focus:outline-none"
          />
        </div>
      )}

      {activeTab === "checkin" ? (
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-bronze-dark">
              Rider Check-in
            </h2>
            <p className="mt-2 max-w-2xl leading-7 text-brown/85">
              {`Check-in runs on ${site.checkInDate}, the day before the event. Enter the code the rider presents, confirm their details, and mark them as arrived. Only riders who are checked in are entered into the brackets.`}
            </p>
          </div>
          <CheckInPanel />
        </section>
      ) : activeTab === "profiles" ? (
        <section className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-bronze-dark">
              Profiles
            </h2>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="text-sm text-brown/80">
                {profilesLoading ? "Loading..." : `${filteredAdminProfileUsers.length} admins`}
              </p>
              <button
                type="button"
                onClick={openAddAdminPicker}
                className="rounded-lg bg-bronze-deep px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-bronze"
              >
                Add Admin
              </button>
            </div>
          </div>

          {isAddAdminOpen && (
            <div className="space-y-4 rounded-lg border border-bronze/20 bg-sand p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="font-display text-lg font-bold uppercase tracking-wide text-bronze-dark">
                  Add Admin
                </h3>
                <button
                  type="button"
                  onClick={closeAddAdminPicker}
                  className="w-fit rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                  Search by Email
                </label>
                <input
                  type="search"
                  value={addAdminSearch}
                  onChange={(event) => {
                    setAddAdminSearch(event.target.value);
                    setPendingAddAdminId(null);
                    setAddAdminError(null);
                  }}
                  placeholder="Search non-admin users..."
                  className="mt-2 w-full rounded-lg border border-bronze/20 bg-cream px-4 py-3 text-brown focus:border-bronze focus:outline-none"
                />
              </div>

              {addAdminError && <p className="text-sm text-red-700">{addAdminError}</p>}

              <div className="max-h-72 overflow-y-auto rounded-lg border border-bronze/20 bg-cream">
                {filteredAddAdminUsers.length > 0 ? (
                  <div className="divide-y divide-bronze/10">
                    {filteredAddAdminUsers.map((profileUser) => {
                      const isPendingAddAdmin = pendingAddAdminId === profileUser.id;
                      const isSavingProfile = savingProfileId === profileUser.id;

                      return (
                        <div
                          key={profileUser.id}
                          className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <p className="font-semibold text-ink">{profileUser.email}</p>

                          {isPendingAddAdmin ? (
                            <div className="flex flex-col gap-2 sm:items-end">
                              <p className="text-xs text-brown/80">
                                Promote {profileUser.email} to admin?
                              </p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => confirmAddAdmin(profileUser)}
                                  disabled={isSavingProfile}
                                  className="rounded-lg bg-bronze-deep px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPendingAddAdminId(null);
                                    setAddAdminError(null);
                                  }}
                                  disabled={isSavingProfile}
                                  className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40 disabled:opacity-60"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setPendingAddAdminId(profileUser.id);
                                setAddAdminError(null);
                              }}
                              className="w-fit rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                            >
                              Select
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="px-4 py-6 text-brown/80">
                    No non-admin users found.
                  </p>
                )}
              </div>
            </div>
          )}

          {emailSyncDialog && (
            <div className="space-y-4 rounded-lg border border-bronze/20 bg-sand p-5">
              <div>
                <h3 className="font-display text-lg font-bold uppercase tracking-wide text-bronze-dark">
                  Sync Registration Emails
                </h3>
                <p className="mt-2 text-sm text-brown/80">
                  This profile has linked registrations. Choose whether their email
                  fields should also change to {emailSyncDialog.newEmail}.
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-bronze/20 bg-cream p-4">
                {emailSyncDialog.registrations.map((registration) => {
                  const registrationKey = linkedRegistrationKey(registration);

                  return (
                    <label
                      key={registrationKey}
                      className="flex items-start gap-3 text-sm text-brown"
                    >
                      <input
                        type="checkbox"
                        checked={selectedLinkedRegistrationKeys.includes(registrationKey)}
                        onChange={(event) => {
                          setEmailSyncError(null);
                          setSelectedLinkedRegistrationKeys((currentKeys) =>
                            event.target.checked
                              ? [...currentKeys, registrationKey]
                              : currentKeys.filter((key) => key !== registrationKey)
                          );
                        }}
                        className="mt-1"
                      />
                      <span>
                        <span className="font-semibold text-ink">
                          {registration.label}
                        </span>
                        <span className="block text-brown/80">
                          Current email: {registration.email}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {emailSyncError && <p className="text-sm text-red-700">{emailSyncError}</p>}

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() =>
                    commitProfileEmail(
                      emailSyncDialog.profileUser,
                      emailSyncDialog.newEmail,
                      emailSyncDialog.registrations.filter((registration) =>
                        selectedLinkedRegistrationKeys.includes(
                          linkedRegistrationKey(registration)
                        )
                      )
                    )
                  }
                  disabled={savingProfileId === emailSyncDialog.profileUser.id}
                  className="rounded-lg bg-bronze-deep px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
                >
                  Yes, Update These Too
                </button>
                <button
                  type="button"
                  onClick={() =>
                    commitProfileEmail(
                      emailSyncDialog.profileUser,
                      emailSyncDialog.newEmail,
                      []
                    )
                  }
                  disabled={savingProfileId === emailSyncDialog.profileUser.id}
                  className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40 disabled:opacity-60"
                >
                  No, Don&apos;t Update Registrations
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmailSyncDialog(null);
                    setSelectedLinkedRegistrationKeys([]);
                    setEmailSyncError(null);
                  }}
                  disabled={savingProfileId === emailSyncDialog.profileUser.id}
                  className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {profilesError ? (
            <p className="rounded-lg border border-bronze/20 bg-sand px-4 py-6 text-red-700">
              {profilesError}
            </p>
          ) : filteredAdminProfileUsers.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-bronze/20 bg-sand">
              <table className="w-full min-w-[820px] table-fixed border-collapse text-left text-sm text-brown">
                <thead className="border-b border-bronze/20 bg-parchment">
                  <tr className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
                    <th className="w-[340px] min-w-[340px] whitespace-nowrap px-3 py-2">Email</th>
                    <th className="w-[110px] min-w-[110px] whitespace-nowrap px-3 py-2">Created</th>
                    <th className="w-[370px] min-w-[370px] whitespace-nowrap px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdminProfileUsers.map((profileUser) => {
                    const confirmingThisUser =
                      confirmingRoleChange?.userId === profileUser.id;
                    const isEditingProfile = editingProfileId === profileUser.id;
                    const isConfirmingProfileDelete =
                      confirmingProfileDelete?.userId === profileUser.id;
                    const isSavingProfile = savingProfileId === profileUser.id;
                    const roleConfirmationText =
                      profileUser.id === currentAdminId &&
                      confirmingRoleChange?.newRole === "player" &&
                      confirmingRoleChange.step === 2
                        ? "This will remove your own admin access. Are you REALLY sure?"
                        : profileUser.id === currentAdminId
                          ? "Are you sure you want to demote yourself?"
                          : "Demote this admin to regular user?";
                    const deleteConfirmationText =
                      profileUser.id === currentAdminId &&
                      confirmingProfileDelete?.step === 2
                        ? "This will permanently delete your login and remove your admin access. This cannot be undone. Are you REALLY sure?"
                        : profileUser.id === currentAdminId
                          ? "Are you sure you want to delete your OWN account?"
                          : "Delete this admin account entirely? This cannot be undone.";

                    return (
                      <tr
                        key={profileUser.id}
                        className="border-b border-bronze/10 last:border-0"
                      >
                        <td className="w-[340px] min-w-[340px] whitespace-nowrap px-3 py-2 font-semibold text-ink">
                          {isEditingProfile ? (
                            <input
                              type="email"
                              value={profileEmailDraft}
                              onChange={(event) => setProfileEmailDraft(event.target.value)}
                              className="w-full rounded-lg border border-bronze/20 bg-cream px-3 py-2 text-brown focus:border-bronze focus:outline-none"
                            />
                          ) : (
                            profileUser.email
                          )}
                        </td>
                        <td className="w-[110px] min-w-[110px] whitespace-nowrap px-3 py-2">
                          {formatSoloRegisteredDate(profileUser.created_at)}
                        </td>
                        <td className="w-[370px] min-w-[370px] whitespace-nowrap px-3 py-2">
                          {isEditingProfile ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => saveProfileEmail(profileUser)}
                                  disabled={isSavingProfile}
                                  className="rounded-lg bg-bronze-deep px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditingProfile}
                                  disabled={isSavingProfile}
                                  className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40 disabled:opacity-60"
                                >
                                  Cancel
                                </button>
                              </div>
                              {profileRowError?.id === profileUser.id && (
                                <p className="whitespace-normal text-xs text-red-700">
                                  {profileRowError.message}
                                </p>
                              )}
                            </div>
                          ) : confirmingThisUser ? (
                            <div className="flex flex-col gap-2">
                              <p className="whitespace-normal text-xs text-brown/80">
                                {roleConfirmationText}
                              </p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => confirmRoleChange(profileUser)}
                                  disabled={isSavingProfile}
                                  className="rounded-lg bg-bronze-deep px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
                                >
                                  Confirm Demote
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelRoleChange}
                                  disabled={isSavingProfile}
                                  className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40 disabled:opacity-60"
                                >
                                  Cancel
                                </button>
                              </div>
                              {profileRowError?.id === profileUser.id && (
                                <p className="whitespace-normal text-xs text-red-700">
                                  {profileRowError.message}
                                </p>
                              )}
                            </div>
                          ) : isConfirmingProfileDelete ? (
                            <div className="flex flex-col gap-2">
                              <p className="whitespace-normal text-xs text-brown/80">
                                {deleteConfirmationText}
                              </p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => confirmDeleteProfile(profileUser)}
                                  disabled={isSavingProfile}
                                  className="rounded-lg bg-bronze-deep px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelDeletingProfile}
                                  disabled={isSavingProfile}
                                  className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40 disabled:opacity-60"
                                >
                                  Cancel
                                </button>
                              </div>
                              {profileRowError?.id === profileUser.id && (
                                <p className="whitespace-normal text-xs text-red-700">
                                  {profileRowError.message}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEditingProfile(profileUser)}
                                  className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startRoleChange(profileUser)}
                                  className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                                >
                                  Demote to User
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startDeletingProfile(profileUser)}
                                  className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                                >
                                  Delete
                                </button>
                              </div>
                              {profileRowError?.id === profileUser.id && (
                                <p className="whitespace-normal text-xs text-red-700">
                                  {profileRowError.message}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-lg border border-bronze/20 bg-sand px-4 py-6 text-brown/80">
              {profilesLoading ? "Loading profiles..." : "No admins found."}
            </p>
          )}
        </section>
      ) : activeTab === "solo" ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-bronze-dark">
              Solo Registrations
            </h2>
            <p className="text-sm text-brown/80">
              {filteredSoloRegistrations.length} results
            </p>
          </div>

          {filteredSoloRegistrations.length > 0 ? (
            <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-bronze/20 bg-sand">
              <table className="w-full min-w-[2040px] table-fixed border-collapse text-left text-sm text-brown">
                <colgroup>
                  <col className="w-[190px]" />
                  <col className="w-[90px]" />
                  <col className="w-[220px]" />
                  <col className="w-[145px]" />
                  <col className="w-[240px]" />
                  <col className="w-[115px]" />
                  <col className="w-[145px]" />
                  <col className="w-[110px]" />
                  <col className="w-[145px]" />
                  <col className="w-[190px]" />
                  <col className="w-[170px]" />
                  <col className="w-[90px]" />
                  <col className="w-[190px]" />
                </colgroup>
                <thead className="border-b border-bronze/20 bg-parchment">
                  <tr className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
                    <th className="whitespace-nowrap px-3 py-2">Name</th>
                    <th className="whitespace-nowrap px-3 py-2">Age</th>
                    <th className="whitespace-nowrap px-3 py-2">Location</th>
                    <th className="whitespace-nowrap px-3 py-2">Phone</th>
                    <th className="whitespace-nowrap px-3 py-2">Email</th>
                    <th className="whitespace-nowrap px-3 py-2">Experience</th>
                    <th className="whitespace-nowrap px-3 py-2">Horse Name</th>
                    <th className="whitespace-nowrap px-3 py-2">Horse Age</th>
                    <th className="whitespace-nowrap px-3 py-2">Horse Breed</th>
                    <th className="whitespace-nowrap px-3 py-2">
                      Emergency Contact
                    </th>
                    <th className="whitespace-nowrap px-3 py-2">
                      Emergency Phone
                    </th>
                    <th className="whitespace-nowrap px-3 py-2">Date</th>
                    <th className="whitespace-nowrap px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSoloRegistrations.map((registration) => {
                    const isEditing = registration.id === editingSoloId;
                    const isConfirmingDelete = registration.id === confirmingDeleteId;
                    const isSaving = registration.id === savingId;

                    return (
                      <tr key={registration.id} className="border-b border-bronze/10 last:border-0">
                        <td className="overflow-hidden whitespace-nowrap px-3 py-2 font-semibold text-ink">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editDraft?.full_name ?? ""}
                              onChange={(event) => updateEditDraft("full_name", event.target.value)}
                              className={adminTableInputClass}
                            />
                          ) : (
                            <AdminTableText value={registration.full_name} />
                          )}
                        </td>
                        <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editDraft?.age ?? ""}
                              onChange={(event) => updateEditDraft("age", event.target.value)}
                              className={adminTableInputClass}
                            />
                          ) : (
                            registration.age
                          )}
                        </td>
                        <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editDraft?.location ?? ""}
                              onChange={(event) => updateEditDraft("location", event.target.value)}
                              className={adminTableInputClass}
                            />
                          ) : (
                            <AdminTableText value={registration.location} />
                          )}
                        </td>
                        <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                          {isEditing ? (
                            <input
                              type="tel"
                              value={editDraft?.phone ?? ""}
                              onChange={(event) => updateEditDraft("phone", event.target.value)}
                              className={adminTableInputClass}
                            />
                          ) : (
                            <AdminTableText value={registration.phone} />
                          )}
                        </td>
                        <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                          {isEditing ? (
                            <input
                              type="email"
                              value={editDraft?.email ?? ""}
                              onChange={(event) => updateEditDraft("email", event.target.value)}
                              className={adminTableInputClass}
                            />
                          ) : (
                            <AdminTableText value={registration.email} />
                          )}
                        </td>
                        <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editDraft?.years_experience ?? ""}
                              onChange={(event) =>
                                updateEditDraft("years_experience", event.target.value)
                              }
                              className={adminTableInputClass}
                            />
                          ) : (
                            registration.years_experience
                          )}
                        </td>
                        <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editDraft?.horse_name ?? ""}
                              onChange={(event) =>
                                updateEditDraft("horse_name", event.target.value)
                              }
                              className={adminTableInputClass}
                            />
                          ) : (
                            <AdminTableText value={registration.horse_name ?? ""} />
                          )}
                        </td>
                        <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editDraft?.horse_age ?? ""}
                              onChange={(event) => updateEditDraft("horse_age", event.target.value)}
                              className={adminTableInputClass}
                            />
                          ) : (
                            registration.horse_age
                          )}
                        </td>
                        <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editDraft?.horse_breed ?? ""}
                              onChange={(event) => updateEditDraft("horse_breed", event.target.value)}
                              className={adminTableInputClass}
                            />
                          ) : (
                            <AdminTableText value={registration.horse_breed} />
                          )}
                        </td>
                        <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editDraft?.emergency_contact_name ?? ""}
                              onChange={(event) =>
                                updateEditDraft(
                                  "emergency_contact_name",
                                  event.target.value
                                )
                              }
                              className={adminTableInputClass}
                            />
                          ) : (
                            <AdminTableText
                              value={registration.emergency_contact_name ?? ""}
                            />
                          )}
                        </td>
                        <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                          {isEditing ? (
                            <input
                              type="tel"
                              value={editDraft?.emergency_contact_phone ?? ""}
                              onChange={(event) =>
                                updateEditDraft(
                                  "emergency_contact_phone",
                                  event.target.value
                                )
                              }
                              className={adminTableInputClass}
                            />
                          ) : (
                            <AdminTableText
                              value={registration.emergency_contact_phone ?? ""}
                            />
                          )}
                        </td>
                        <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                          {formatSoloRegisteredDate(registration.created_at)}
                        </td>
                        <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                          {isEditing ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => saveSoloRegistration(registration.id)}
                                  disabled={isSaving}
                                  className="rounded-lg bg-bronze-deep px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditingSolo}
                                  disabled={isSaving}
                                  className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40 disabled:opacity-60"
                                >
                                  Cancel
                                </button>
                              </div>
                              {rowError?.id === registration.id && (
                                <p className="whitespace-normal text-xs text-red-700">
                                  {rowError.message}
                                </p>
                              )}
                            </div>
                          ) : isConfirmingDelete ? (
                            <div className="flex flex-col gap-2">
                              <p className="whitespace-normal text-xs text-brown/80">
                                Delete this registration?
                              </p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => deleteSoloRegistration(registration.id)}
                                  disabled={isSaving}
                                  className="rounded-lg bg-bronze-deep px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelDeletingSolo}
                                  disabled={isSaving}
                                  className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40 disabled:opacity-60"
                                >
                                  Cancel
                                </button>
                              </div>
                              {rowError?.id === registration.id && (
                                <p className="whitespace-normal text-xs text-red-700">
                                  {rowError.message}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => startEditingSolo(registration)}
                                className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => startDeletingSolo(registration.id)}
                                className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-lg border border-bronze/20 bg-sand px-4 py-6 text-brown/80">
              No results found.
            </p>
          )}
        </section>
      ) : activeTab === "audit" ? (
        <section className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-bronze-dark">
              Audit Log
            </h2>
            <p className="text-sm text-brown/80">{filteredAuditLog.length} results</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                Action
              </label>
              <select
                value={auditActionFilter}
                onChange={(event) => setAuditActionFilter(event.target.value)}
                className="mt-2 w-full rounded-lg border border-bronze/20 bg-sand px-4 py-3 text-brown focus:border-bronze focus:outline-none"
              >
                <option value="all">All actions</option>
                {auditActionOptions.map((action) => (
                  <option key={action} value={action}>
                    {formatAuditAction(action)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                Admin
              </label>
              <select
                value={auditActorFilter}
                onChange={(event) => setAuditActorFilter(event.target.value)}
                className="mt-2 w-full rounded-lg border border-bronze/20 bg-sand px-4 py-3 text-brown focus:border-bronze focus:outline-none"
              >
                <option value="all">All admins</option>
                {auditActorOptions.map((actorId) => (
                  <option key={actorId} value={actorId}>
                    {getAuditActorLabel(actorId)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredAuditLog.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-bronze/20 bg-sand">
              <table className="w-full min-w-[1100px] table-fixed border-collapse text-left text-sm text-brown">
                <thead className="border-b border-bronze/20 bg-parchment">
                  <tr className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
                    <th className="w-[180px] min-w-[180px] whitespace-nowrap px-3 py-2">Date/Time</th>
                    <th className="w-[220px] min-w-[220px] whitespace-nowrap px-3 py-2">Admin</th>
                    <th className="w-[210px] min-w-[210px] whitespace-nowrap px-3 py-2">Action</th>
                    <th className="w-[260px] min-w-[260px] whitespace-nowrap px-3 py-2">Target</th>
                    <th className="w-[230px] min-w-[230px] whitespace-nowrap px-3 py-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogItems.map((item) => {
                    if (item.type === "batch") {
                      const firstEntry = item.entries[0];
                      const earliestEntry = getEarliestAuditEntry(item.entries);
                      const teamEntry = item.entries.find(
                        (entry) => entry.action === "edit_team"
                      );
                      const memberEntries = item.entries.filter(
                        (entry) => entry.action === "edit_team_member"
                      );
                      const batchDetailSections = [
                        ...(teamEntry
                          ? [
                              {
                                id: teamEntry.id,
                                label: `Team: ${
                                  getAuditSubjectName(teamEntry.details) ??
                                  shortenId(teamEntry.target_id)
                                }`,
                                rows: getAuditDetailRows(teamEntry.details),
                              },
                            ]
                          : []),
                        ...memberEntries.map((entry) => ({
                          id: entry.id,
                          label: `Team Member: ${
                            getAuditSubjectName(entry.details) ??
                            shortenId(entry.target_id)
                          }`,
                          rows: getAuditDetailRows(entry.details),
                        })),
                      ].filter((section) => section.rows.length > 0);
                      const isExpanded = expandedAuditLogId === item.batchId;

                      return (
                        <Fragment key={item.batchId}>
                          <tr className="border-b border-bronze/10 last:border-0">
                            <td className="w-[180px] min-w-[180px] whitespace-nowrap px-3 py-2">
                              {formatAuditDate(earliestEntry.created_at)}
                            </td>
                            <td className="w-[220px] min-w-[220px] whitespace-nowrap px-3 py-2 font-semibold text-ink">
                              {getAuditActorLabel(
                                firstEntry.actor_id,
                                firstEntry.actor_name,
                                firstEntry.actor_email
                              )}
                            </td>
                            <td className="w-[210px] min-w-[210px] whitespace-nowrap px-3 py-2">
                              {item.entries.length === 1
                                ? formatAuditAction(firstEntry.action)
                                : "Various"}
                            </td>
                            <td className="w-[260px] min-w-[260px] whitespace-nowrap px-3 py-2">
                              <div>
                                {teamEntry && (
                                  <div>
                                    Team:{" "}
                                    {getAuditSubjectName(teamEntry.details) ??
                                      shortenId(teamEntry.target_id)}
                                  </div>
                                )}

                                {memberEntries.map((entry) => (
                                  <div key={entry.id}>
                                    Team Member:{" "}
                                    {getAuditSubjectName(entry.details) ??
                                      shortenId(entry.target_id)}
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="w-[230px] min-w-[230px] px-3 py-2">
                              {batchDetailSections.length > 0 ? (
                                <div className="space-y-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedAuditLogId(
                                        isExpanded ? null : item.batchId
                                      )
                                    }
                                    className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                                  >
                                    {isExpanded ? "Hide" : "View"}
                                  </button>
                                  {isExpanded && (
                                    <div className="max-h-80 space-y-3 overflow-auto rounded-lg border border-bronze/20 bg-cream p-3 text-xs text-brown">
                                      {batchDetailSections.map((section) => (
                                        <div
                                          key={section.id}
                                          className="space-y-2 border-t border-bronze/10 pt-3 first:border-t-0 first:pt-0"
                                        >
                                          <h3 className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark">
                                            {section.label}
                                          </h3>
                                          <div className="space-y-1">
                                            {section.rows.map((row) => (
                                              <p key={row.label}>
                                                <span className="font-semibold text-ink">
                                                  {row.label}:
                                                </span>{" "}
                                                {row.value}
                                              </p>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-brown/70">—</span>
                              )}
                            </td>
                          </tr>
                        </Fragment>
                      );
                    }

                    const { entry } = item;
                    const detailRows = getAuditDetailRows(entry.details);
                    const hasDetails = detailRows.length > 0;
                    const isExpanded = expandedAuditLogId === entry.id;

                    return (
                      <tr
                        key={entry.id}
                        className="border-b border-bronze/10 last:border-0"
                      >
                        <td className="w-[180px] min-w-[180px] whitespace-nowrap px-3 py-2">
                          {formatAuditDate(entry.created_at)}
                        </td>
                        <td className="w-[220px] min-w-[220px] whitespace-nowrap px-3 py-2 font-semibold text-ink">
                          {getAuditActorLabel(
                            entry.actor_id,
                            entry.actor_name,
                            entry.actor_email
                          )}
                        </td>
                        <td className="w-[210px] min-w-[210px] whitespace-nowrap px-3 py-2">
                          {formatAuditAction(entry.action)}
                        </td>
                        <td className="w-[260px] min-w-[260px] whitespace-nowrap px-3 py-2">
                          {getAuditTargetLabel(
                            entry.target_table,
                            entry.target_id,
                            entry.details
                          )}
                        </td>
                        <td className="w-[230px] min-w-[230px] px-3 py-2">
                          {hasDetails ? (
                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedAuditLogId(isExpanded ? null : entry.id)
                                }
                                className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                              >
                                {isExpanded ? "Hide" : "View"}
                              </button>
                              {isExpanded && (
                                <div className="max-h-60 space-y-2 overflow-auto rounded-lg border border-bronze/20 bg-cream p-3 text-xs text-brown">
                                  {detailRows.map((row) => (
                                    <p key={row.label}>
                                      <span className="font-semibold text-ink">
                                        {row.label}:
                                      </span>{" "}
                                      {row.value}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-brown/70">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-lg border border-bronze/20 bg-sand px-4 py-6 text-brown/80">
              No audit log entries found.
            </p>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-bronze-dark">
              Team Registrations
            </h2>
            <p className="text-sm text-brown/80">{filteredTeams.length} results</p>
          </div>

          {filteredTeams.length > 0 ? (
            <div className="space-y-6">
              {filteredTeams.map((team) => {
                const members = teamMembersByTeamId[team.id] ?? [];
                const isEditingTeam = team.id === editingTeamId;
                const isConfirmingDeleteTeam = team.id === confirmingDeleteTeamId;
                const isSavingTeam = team.id === savingTeamId;

                return (
                  <article
                    key={team.id}
                    className="rounded-lg border border-bronze/20 bg-sand p-5"
                  >
                    <div className="flex flex-col gap-4 border-b border-bronze/20 pb-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        {isEditingTeam ? (
                          <input
                            type="text"
                            value={teamNameDraft}
                            onChange={(event) => setTeamNameDraft(event.target.value)}
                            className="w-full rounded-lg border border-bronze/20 bg-cream px-3 py-2 font-display text-xl font-bold uppercase tracking-wide text-bronze-dark focus:border-bronze focus:outline-none"
                          />
                        ) : (
                          <h3 className="font-display text-xl font-bold uppercase tracking-wide text-bronze-dark">
                            {team.team_name}
                          </h3>
                        )}
                        <p className="mt-1 text-sm text-brown/80">
                          {members.length} members
                        </p>
                      </div>
                      <div className="flex flex-col gap-3 lg:items-end">
                        <p className="text-sm text-brown/80">
                          Registered {formatDate(team.created_at)}
                        </p>

                        {isEditingTeam ? (
                          <div className="flex flex-col gap-2 lg:items-end">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => saveTeamRegistration(team, members)}
                                disabled={isSavingTeam}
                                className="rounded-lg bg-bronze-deep px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditingTeam}
                                disabled={isSavingTeam}
                                className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40 disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </div>
                            {teamEditError?.id === team.id && (
                              <p className="max-w-sm text-xs text-red-700">
                                {teamEditError.message}
                              </p>
                            )}
                          </div>
                        ) : isConfirmingDeleteTeam ? (
                          <div className="flex flex-col gap-2 lg:items-end">
                            <p className="text-xs text-brown/80">
                              Delete this entire team and all its members?
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => deleteTeamRegistration(team.id)}
                                disabled={isSavingTeam}
                                className="rounded-lg bg-bronze-deep px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-bronze disabled:opacity-60"
                              >
                                Confirm Delete
                              </button>
                              <button
                                type="button"
                                onClick={cancelDeletingTeam}
                                disabled={isSavingTeam}
                                className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40 disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </div>
                            {teamEditError?.id === team.id && (
                              <p className="max-w-sm text-xs text-red-700">
                                {teamEditError.message}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEditingTeam(team, members)}
                              className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => startDeletingTeam(team.id)}
                              className="rounded-lg border border-bronze/20 px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-bronze-dark transition-colors hover:border-bronze/40"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {members.length > 0 ? (
                      <div className="mt-4 max-w-full overflow-x-auto overscroll-x-contain">
                        <table className="w-full min-w-[1390px] table-fixed border-collapse text-left text-sm text-brown">
                          <colgroup>
                            <col className="w-[230px]" />
                            <col className="w-[90px]" />
                            <col className="w-[280px]" />
                            <col className="w-[160px]" />
                            <col className="w-[250px]" />
                            <col className="w-[120px]" />
                            <col className="w-[110px]" />
                            <col className="w-[150px]" />
                          </colgroup>
                          <thead className="border-b border-bronze/20 bg-parchment">
                            <tr className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink">
                              <th className="whitespace-nowrap px-3 py-2">Name</th>
                              <th className="whitespace-nowrap px-3 py-2">Age</th>
                              <th className="whitespace-nowrap px-3 py-2">Location</th>
                              <th className="whitespace-nowrap px-3 py-2">Phone</th>
                              <th className="whitespace-nowrap px-3 py-2">Email</th>
                              <th className="whitespace-nowrap px-3 py-2">Experience</th>
                              <th className="whitespace-nowrap px-3 py-2">Horse Age</th>
                              <th className="whitespace-nowrap px-3 py-2">Horse Breed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {members.map((member) => (
                              <tr
                                key={member.id}
                                className="border-b border-bronze/10 last:border-0"
                              >
                                <td className="overflow-hidden whitespace-nowrap px-3 py-2 font-semibold text-ink">
                                  {isEditingTeam ? (
                                    <div className="flex min-w-0 items-center gap-2">
                                      <input
                                        type="text"
                                        value={memberDrafts[member.id]?.full_name ?? ""}
                                        onChange={(event) =>
                                          updateMemberDraft(
                                            member.id,
                                            "full_name",
                                            event.target.value
                                          )
                                        }
                                        className={adminTableInputClass}
                                      />
                                      {member.is_leader && (
                                        <span className="shrink-0 rounded-full bg-bronze px-2 py-1 font-display text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-cream">
                                          Leader
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="flex min-w-0 items-center gap-2">
                                      <AdminTableText
                                        value={member.full_name}
                                        className="flex-1"
                                      />
                                      {member.is_leader && (
                                        <span className="shrink-0 rounded-full bg-bronze px-2 py-1 font-display text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-cream">
                                          Leader
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </td>
                                <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                                  {isEditingTeam ? (
                                    <input
                                      type="number"
                                      value={memberDrafts[member.id]?.age ?? ""}
                                      onChange={(event) =>
                                        updateMemberDraft(member.id, "age", event.target.value)
                                      }
                                      className={adminTableInputClass}
                                    />
                                  ) : (
                                    member.age
                                  )}
                                </td>
                                <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                                  {isEditingTeam ? (
                                    <input
                                      type="text"
                                      value={memberDrafts[member.id]?.location ?? ""}
                                      onChange={(event) =>
                                        updateMemberDraft(
                                          member.id,
                                          "location",
                                          event.target.value
                                        )
                                      }
                                      className={adminTableInputClass}
                                    />
                                  ) : (
                                    <AdminTableText value={member.location} />
                                  )}
                                </td>
                                <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                                  {isEditingTeam ? (
                                    <input
                                      type="tel"
                                      value={memberDrafts[member.id]?.phone ?? ""}
                                      onChange={(event) =>
                                        updateMemberDraft(member.id, "phone", event.target.value)
                                      }
                                      className={adminTableInputClass}
                                    />
                                  ) : (
                                    <AdminTableText value={member.phone} />
                                  )}
                                </td>
                                <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                                  {isEditingTeam ? (
                                    <input
                                      type="email"
                                      value={memberDrafts[member.id]?.email ?? ""}
                                      onChange={(event) =>
                                        updateMemberDraft(member.id, "email", event.target.value)
                                      }
                                      className={adminTableInputClass}
                                    />
                                  ) : (
                                    <AdminTableText value={member.email} />
                                  )}
                                </td>
                                <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                                  {isEditingTeam ? (
                                    <input
                                      type="number"
                                      value={memberDrafts[member.id]?.years_experience ?? ""}
                                      onChange={(event) =>
                                        updateMemberDraft(
                                          member.id,
                                          "years_experience",
                                          event.target.value
                                        )
                                      }
                                      className={adminTableInputClass}
                                    />
                                  ) : (
                                    member.years_experience
                                  )}
                                </td>
                                <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                                  {isEditingTeam ? (
                                    <input
                                      type="number"
                                      value={memberDrafts[member.id]?.horse_age ?? ""}
                                      onChange={(event) =>
                                        updateMemberDraft(
                                          member.id,
                                          "horse_age",
                                          event.target.value
                                        )
                                      }
                                      className={adminTableInputClass}
                                    />
                                  ) : (
                                    member.horse_age
                                  )}
                                </td>
                                <td className="overflow-hidden whitespace-nowrap px-3 py-2">
                                  {isEditingTeam ? (
                                    <input
                                      type="text"
                                      value={memberDrafts[member.id]?.horse_breed ?? ""}
                                      onChange={(event) =>
                                        updateMemberDraft(
                                          member.id,
                                          "horse_breed",
                                          event.target.value
                                        )
                                      }
                                      className={adminTableInputClass}
                                    />
                                  ) : (
                                    <AdminTableText value={member.horse_breed} />
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="mt-4 rounded-lg border border-bronze/20 bg-cream px-4 py-6 text-brown/80">
                        No members submitted yet.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-bronze/20 bg-sand px-4 py-6 text-brown/80">
              No results found.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
