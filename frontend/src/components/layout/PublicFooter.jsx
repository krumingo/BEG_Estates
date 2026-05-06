import React from "react";

export default function PublicFooter() {
    return (
        <footer
            data-testid="public-footer"
            className="bg-slate-900 text-slate-300 py-12 mt-24"
        >
            <div className="container mx-auto px-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <img
                        src="/logos/beg_estates_dark.svg"
                        alt="BEG Estates"
                        className="h-9 w-auto"
                        data-testid="public-footer-logo"
                    />
                    <div className="text-xs text-slate-400 tracking-wide">
                        © {new Date().getFullYear()} Building Express 90R · Всички права запазени
                    </div>
                </div>
            </div>
        </footer>
    );
}
