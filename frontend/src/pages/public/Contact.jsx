import React from "react";
import PublicHeader from "../../components/layout/PublicHeader";
import InquiryForm from "./InquiryForm";

export default function Contact() {
    return (
        <div className="min-h-screen bg-white pt-24">
            <PublicHeader />
            <section className="mx-auto max-w-5xl px-6 lg:px-10 pt-12 pb-24">
                <div className="overline mb-3">Контакт</div>
                <h1 className="font-serif text-5xl text-slate-900 mb-4">Да започнем разговор</h1>
                <p className="text-slate-600 mb-12 max-w-xl">Споделете с нас с какво можем да ви помогнем и ще се свържем до 24 часа.</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <div className="space-y-4 text-slate-700">
                        <div>
                            <div className="overline">Адрес</div>
                            <div className="mt-1">София, кв. Манастирски ливади, ул. Цар Борис III 215</div>
                        </div>
                        <div>
                            <div className="overline">Телефон</div>
                            <div className="mt-1">+359 2 123 4567</div>
                        </div>
                        <div>
                            <div className="overline">Имейл</div>
                            <div className="mt-1">hello@begestates.bg</div>
                        </div>
                    </div>
                    <InquiryForm />
                </div>
            </section>
        </div>
    );
}
