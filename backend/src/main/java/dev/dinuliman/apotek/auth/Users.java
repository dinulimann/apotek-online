package dev.dinuliman.apotek.auth;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Repository;

@Repository
public class Users implements UserDetailsService {

	private final JdbcClient db;

	Users(JdbcClient db) { this.db = db; }

	public Optional<CurrentUser> byEmail(String email) {
		return db.sql("select id, email, name, role, password_hash from users where email = ?").param(email.toLowerCase())
			.query((rs, n) -> new CurrentUser(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5))).optional();
	}

	public long create(String email, String passwordHash, String name, String phone, String role) {
		return db.sql("insert into users (email, password_hash, name, phone, role) values (?, ?, ?, ?, ?) returning id")
			.params(email.toLowerCase(), passwordHash, name, phone, role).query(Long.class).single();
	}

	@Override
	public CurrentUser loadUserByUsername(String email) {
		return byEmail(email).orElseThrow(() -> new UsernameNotFoundException("unknown user"));
	}

}
