"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  loginAction,
  registerAction,
  type AuthActionState,
} from "@/lib/actions/auth";

const initialState: AuthActionState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <AuthCard
      title="Sign in"
      subtitle="Continue to Work Threads"
      footer={
        <>
          No account?{" "}
          <Link href="/register" className="text-accent hover:underline">
            Register
          </Link>
        </>
      }
    >
      <form action={action} className="flex flex-col gap-4">
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
        />
        {state.error ? <ErrorText>{state.error}</ErrorText> : null}
        <Submit pending={pending}>Sign in</Submit>
      </form>
    </AuthCard>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initialState);

  return (
    <AuthCard
      title="Create account"
      subtitle="Start coordinating in threads"
      footer={
        <>
          Already registered?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form action={action} className="flex flex-col gap-4">
        <Field label="Name" name="name" type="text" autoComplete="name" />
        {state.fieldErrors?.name ? (
          <ErrorText>{state.fieldErrors.name[0]}</ErrorText>
        ) : null}
        <Field label="Email" name="email" type="email" autoComplete="email" />
        {state.fieldErrors?.email ? (
          <ErrorText>{state.fieldErrors.email[0]}</ErrorText>
        ) : null}
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
        />
        {state.fieldErrors?.password ? (
          <ErrorText>{state.fieldErrors.password[0]}</ErrorText>
        ) : null}
        {state.error ? <ErrorText>{state.error}</ErrorText> : null}
        <Submit pending={pending}>Create account</Submit>
      </form>
    </AuthCard>
  );
}

function AuthCard({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-sm">
      <div className="mb-6">
        <p className="text-sm font-medium tracking-wide text-accent">
          Work Threads
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>
      {children}
      <p className="mt-6 text-center text-sm text-muted">{footer}</p>
    </div>
  );
}

function Field({
  label,
  name,
  type,
  autoComplete,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        className="rounded-lg border border-border bg-background px-3 py-2 outline-none ring-accent focus:ring-2"
      />
    </label>
  );
}

function Submit({
  pending,
  children,
}: {
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-danger">{children}</p>;
}
