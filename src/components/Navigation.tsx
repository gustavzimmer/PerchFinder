import { A, useNavigate } from "@solidjs/router";
import { Component, createSignal, onCleanup, onMount } from "solid-js";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "../firebase";

const Navigation: Component = () => {
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = createSignal<User | null>(auth.currentUser);
    const [isSigningOut, setIsSigningOut] = createSignal(false);

    onMount(() => {
        const unsub = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
        });
        onCleanup(() => unsub());
    });

    const handleSignOut = async () => {
        setIsSigningOut(true);
        try {
            await signOut(auth);
            navigate("/");
        } catch (err) {
            console.error("Kunde inte logga ut", err);
        } finally {
            setIsSigningOut(false);
        }
    };

    return (
            <nav class="main-nav">
                <div class="nav-links">
                    <A href="/">Hem</A>
                    <A href="/registrera-fiskevatten">Registrera vatten</A>
                </div>
                {currentUser() ? (
                    <div class="nav-links">
                        <span class="nav-user">{currentUser()?.email}</span>
                        <button
                            type="button"
                            class="nav-button"
                            onClick={handleSignOut}
                            disabled={isSigningOut()}
                        >
                            {isSigningOut() ? "Loggar ut..." : "Logga ut"}
                        </button>
                    </div>
                ) : (
                    <div class="nav-links">
                        <A href="/logga-in">Logga in</A>
                        <A href="/skapa-konto">Skapa konto</A>
                    </div>
                )}
            </nav>
    )
}

export default Navigation
