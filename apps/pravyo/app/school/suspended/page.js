'use client';

import { signOut } from 'next-auth/react';
import { Ban as FaBan } from 'lucide-react';

export default function SuspendedPage() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-canvas text-ink p-4">
            <div className="bg-surface p-6 rounded-card border border-danger shadow-pop max-w-md text-center">
                <div className="w-16 h-16 bg-danger rounded-full flex items-center justify-center mx-auto mb-4">
                    <FaBan className="text-2xl text-danger" />
                </div>
                <h1 className="font-semibold mb-4">Account Suspended</h1>
                <p className="text-subtle mb-5">
                    Your school&apos;s subscription is currently inactive. Please contact the Super Admin to reactivate your account.
                </p>
                <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="btn btn-primary transition-colors"
                >
                    Logout
                </button>
            </div>
        </div>
    );
}
