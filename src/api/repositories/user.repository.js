import { BATHER_ROLE_ID, PET_OWNER_ROLE_ID, VETERINARY_ROLE_ID } from '../../constants/database.js';
import { Clinic, User, Role, UserRole } from '../models/index.js';

const createUser = async ({ userData, roleIds = [] }) => {
  try {
    const newUser = await User.create(userData);

    if (!newUser) {
      throw new Error('Failed to create user');
    }

    // Associar roles ao usuário
    if (roleIds.length > 0) {
      await newUser.setRoles(roleIds);
    }

    // Buscar o usuário com as roles associadas
    return await getUserById({ id: newUser.id });
  } catch (error) {
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    throw new Error(`Service error: ${error.message}`);
  }
};

const createVeterinary = async ({ userData }) => {
  try {
    const newUser = await User.create(userData);

    if (!newUser) {
      throw new Error('Failed to create user');
    }

    // Associar role de veterinário
    await newUser.setRoles([VETERINARY_ROLE_ID]);

    // Buscar o usuário com as roles associadas
    return await getUserById({ id: newUser.id });
  } catch (error) {
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    throw new Error(`Service error: ${error.message}`);
  }
};

const createPetOwner = async ({ userData }) => {
  try {
    const newUser = await User.create(userData);

    if (!newUser) {
      throw new Error('Failed to create user');
    }

    // Associar role de dono de pet
    await newUser.setRoles([PET_OWNER_ROLE_ID]);

    // Buscar o usuário com as roles associadas
    return await getUserById({ id: newUser.id });
  } catch (error) {
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    throw new Error(`Service error: ${error.message}`);
  }
};

const createAdmin = async ({ userData, roleIds = [] }) => {
  try {
    const newUser = await User.create(userData);

    if (!newUser) {
      throw new Error('Failed to create user');
    }

    // Associar roles ao admin
    if (roleIds.length > 0) {
      await newUser.setRoles(roleIds);
    }

    // Buscar o usuário com as roles associadas
    return await getUserById({ id: newUser.id });
  } catch (error) {
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    throw new Error(`Service error: ${error.message}`);
  }
};

const getAllVeterinaries = async () => {
  try {
    // Buscar usuários que têm a role de veterinário
    const veterinaries = await User.findAll({
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: Role,
          as: 'roles',
          attributes: ['id', 'role'],
          through: { attributes: [] }, // Excluir campos da tabela intermediária
          where: {
            id: VETERINARY_ROLE_ID,
          },
        },
      ],
      attributes: ['id', 'name', 'email', 'clinic_id', 'created_at'],
    });

    return veterinaries;
  } catch (error) {
    throw new Error(`Error fetching veterinaries: ${error.message}`);
  }
};

const getAllPetOwners = async () => {
  try {
    // Buscar usuários que têm a role de dono de pet
    const petOwners = await User.findAll({
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: Role,
          as: 'roles',
          attributes: ['id', 'role'],
          through: { attributes: [] },
          where: {
            id: PET_OWNER_ROLE_ID,
          },
        },
      ],
      attributes: ['id', 'name', 'email', 'clinic_id', 'created_at'],
    });

    return petOwners;
  } catch (error) {
    throw new Error(`Error fetching pet owners: ${error.message}`);
  }
};

const getAllUsers = async () => {
  try {
    const users = await User.findAll({
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: Role,
          as: 'roles',
          attributes: ['id', 'role'],
          through: { attributes: [] }, // Excluir campos da tabela intermediária
        },
      ],
      attributes: ['id', 'name', 'email', 'clinic_id', 'created_at'],
    });

    return users;
  } catch (error) {
    throw new Error(`Error fetching users: ${error.message}`);
  }
};

const getAllBathers = async ({ clinic_id }) => {
  try {
    const bathers = await User.findAll({
      where: {
        clinic_id: clinic_id,
      },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: Role,
          as: 'roles',
          attributes: ['id', 'role'],
          through: {
            attributes: [],
            where: {},
          },
          where: {
            id: BATHER_ROLE_ID,
          },
          required: true,
        },
      ],
      attributes: ['id', 'name', 'email', 'clinic_id', 'created_at'],
    });

    return bathers;
  } catch (error) {
    throw new Error(`Error fetching bathers: ${error.message}`);
  }
};

const getUserByEmail = async ({ email, password = false }) => {
  try {
    const attributes = ['id', 'name', 'email', 'clinic_id', 'created_at'];

    if (password) {
      attributes.push('password');
    }

    const user = await User.findOne({
      where: { email },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: Role,
          as: 'roles',
          attributes: ['id', 'role'],
          through: { attributes: [] },
        },
      ],
      attributes,
      nest: true,
    });

    return user;
  } catch (error) {
    console.error('Error details:', error);
    throw new Error(`Error fetching user by email: ${error.message}`);
  }
};

const getUserById = async ({ id }) => {
  try {
    const user = await User.findOne({
      where: { id },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: Role,
          as: 'roles',
          attributes: ['id', 'role'],
          through: { attributes: [] },
        },
      ],
      attributes: ['id', 'name', 'email', 'clinic_id', 'created_at'],
    });

    return user;
  } catch (error) {
    throw new Error(`Error fetching user by id: ${error.message}`);
  }
};

const getVeterinaryById = async ({ id }) => {
  try {
    // Buscar usuário que tem a role de veterinário
    const veterinary = await User.findOne({
      where: { id },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: Role,
          as: 'roles',
          attributes: ['id', 'role'],
          through: { attributes: [] },
          where: {
            id: VETERINARY_ROLE_ID,
          },
        },
      ],
      attributes: ['id', 'name', 'email', 'clinic_id', 'created_at'],
    });

    return veterinary;
  } catch (error) {
    throw new Error(`Error fetching veterinary by id: ${error.message}`);
  }
};

const getPetOwnerById = async ({ id }) => {
  try {
    // Buscar usuário que tem a role de dono de pet
    const petOwner = await User.findOne({
      where: { id },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: Role,
          as: 'roles',
          attributes: ['id', 'role'],
          through: { attributes: [] },
          where: {
            id: PET_OWNER_ROLE_ID,
          },
        },
      ],
      attributes: ['id', 'name', 'email', 'clinic_id', 'created_at'],
    });

    return petOwner;
  } catch (error) {
    throw new Error(`Error fetching pet owner by id: ${error.message}`);
  }
};

// Função para adicionar uma role a um usuário
const addRoleToUser = async ({ userId, roleId }) => {
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await user.addRole(roleId);
    return await getUserById({ id: userId });
  } catch (error) {
    throw new Error(`Error adding role to user: ${error.message}`);
  }
};

// Função para remover uma role de um usuário
const removeRoleFromUser = async ({ userId, roleId }) => {
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await user.removeRole(roleId);
    return await getUserById({ id: userId });
  } catch (error) {
    throw new Error(`Error removing role from user: ${error.message}`);
  }
};

// Função para verificar se um usuário tem uma role específica
const userHasRole = async ({ userId, roleId }) => {
  try {
    const userRole = await UserRole.findOne({
      where: {
        user_id: userId,
        role_id: roleId,
      },
    });

    return !!userRole;
  } catch (error) {
    throw new Error(`Error checking user role: ${error.message}`);
  }
};

export default {
  createUser,
  createVeterinary,
  createPetOwner,
  createAdmin,
  getAllVeterinaries,
  getAllPetOwners,
  getAllUsers,
  getAllBathers,
  getUserByEmail,
  getUserById,
  getVeterinaryById,
  getPetOwnerById,
  addRoleToUser,
  removeRoleFromUser,
  userHasRole,
};
