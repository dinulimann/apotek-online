package dev.dinuliman.apotek.auth;

import java.util.Collection;
import java.util.List;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/** The signed-in user, as stored in the session. */
public record CurrentUser(long id, String email, String name, String role, String passwordHash) implements UserDetails {

	public boolean isPharmacist() { return "PHARMACIST".equals(role); }

	@Override public Collection<? extends GrantedAuthority> getAuthorities() { return List.of(new SimpleGrantedAuthority("ROLE_" + role)); }
	@Override public String getPassword() { return passwordHash; }
	@Override public String getUsername() { return email; }

	/** Drops the hash before the principal is kept in the session. */
	public CurrentUser withoutPassword() { return new CurrentUser(id, email, name, role, ""); }

}
