const bcrypt    = require('bcrypt');
const userModel = require('../models/userModel');

const Session = {

    async ListProfiles() {
        const rows = await userModel.listProfiles();
        return {
            success: true,
            profiles: rows.map(p => ({
                id:          p.id,
                name:        p.name,
                description: p.description
            }))
        };
    },

 
    async Register({ name, email, password, profiles }) {
        if (!name || !email || !password) {
            return { success: false, message: 'Nombre, email y contrasena son obligatorios' };
        }
        if (typeof name !== 'string' || name.trim().length < 2) {
            return { success: false, message: 'El nombre debe tener al menos 2 caracteres' };
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return { success: false, message: 'El email no tiene un formato valido' };
        }

        if (password.length < 6) {
            return { success: false, message: 'La contrasena debe tener al menos 6 caracteres' };
        }

        
        if (!Array.isArray(profiles) || profiles.length === 0) {
            return {
                success: false,
                message: 'Debes seleccionar al menos un perfil. Consulta GET /api/auth/profiles'
            };
        }

       
        const perfilesValidos = await userModel.findProfilesByNames(profiles);
        if (perfilesValidos.length !== profiles.length) {
            const encontrados = perfilesValidos.map(p => p.name);
            const noEncontrados = profiles.filter(p => !encontrados.includes(p));
            return {
                success: false,
                message: `Perfiles invalidos: ${noEncontrados.join(', ')}`,
                validProfiles: encontrados
            };
        }
       
        const existing = await userModel.findByEmail(email);
        if (existing) {
            return { success: false, message: 'El email ya esta registrado' };
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const newUser = await userModel.createUser({
            name:  name.trim(),
            email: email.toLowerCase().trim(),
            passwordHash
        });

        await userModel.attachProfiles(newUser.id, profiles);

        const profileRows = await userModel.getProfilesByUserId(newUser.id);

        return {
            success: true,
            message: 'Usuario registrado correctamente',
            user: {
                UserID: newUser.id,
                Name:   newUser.name,
                Profile: profileRows.map(p => ({
                    id:          p.id,
                    name:        p.name,
                    description: p.description
                }))
            }
        };
    },

    async Authenticate(userName, password) {
        if (!userName || !password) {
            return { success: false, message: 'Usuario y contrasena son obligatorios' };
        }

        const user = await userModel.findByEmail(userName);
        if (!user || user.active !== true) {
            return { success: false, message: 'Credenciales invalidas' };
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return { success: false, message: 'Credenciales invalidas' };
        }

        const profiles = await userModel.getProfilesByUserId(user.id);

        return {
            success: true,
            user: {
                UserID: user.id,
                Name:   user.name,
                Profile: profiles.map(p => ({
                    id:          p.id,
                    name:        p.name,
                    description: p.description
                }))
            }
        };
    },

    CreateSession(req, sessionObject) {
        return new Promise((resolve, reject) => {
            req.session.regenerate((err) => {
                if (err) return reject(err);

                req.session.user = {
                    UserID:  sessionObject.UserID,
                    Name:    sessionObject.Name,
                    Profile: Array.isArray(sessionObject.Profile) ? sessionObject.Profile : []
                };

                req.session.save((err2) => {
                    if (err2) return reject(err2);
                    resolve({ success: true, message: 'Sesion creada correctamente' });
                });
            });
        });
    },

    CloseSession(req, res) {
        return new Promise((resolve, reject) => {
            if (!req.session) {
                return resolve({ success: true, message: 'No habia sesion activa' });
            }
            req.session.destroy((err) => {
                if (err) return reject(err);
                res.clearCookie(process.env.SESSION_COOKIE_NAME || 'sid', { path: '/' });
                resolve({ success: true, message: 'Sesion cerrada correctamente' });
            });
        });
    },

    GetSession(req) {
        if (!req.session || !req.session.user) return null;
        const { UserID, Name, Profile } = req.session.user;
        return {
            UserID,
            Name,
            Profile: Array.isArray(Profile) ? Profile : []
        };
    }
};

module.exports = Session;

