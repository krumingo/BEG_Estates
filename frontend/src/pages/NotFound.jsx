import React from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";

export default function NotFound() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
            <div className="overline mb-3">404</div>
            <h1 className="font-serif text-6xl text-slate-900 mb-4">Страницата не съществува</h1>
            <p className="text-slate-500 mb-8">Тази връзка може да е преместена или премахната.</p>
            <Link to="/"><Button data-testid="notfound-home">Върни се към началото</Button></Link>
        </div>
    );
}
