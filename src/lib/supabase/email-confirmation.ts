type UserWithEmailConfirmation = {
  email_confirmed_at?: string | null;
};

export const hasConfirmedEmail = (
  user: UserWithEmailConfirmation | null | undefined
) => Boolean(user?.email_confirmed_at);
