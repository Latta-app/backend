DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS set_next_due_date() CASCADE;

-- Drop tables with foreign key dependencies first
DROP TABLE IF EXISTS vaccines CASCADE;
DROP TABLE IF EXISTS protocols CASCADE;
DROP TABLE IF EXISTS pet_weight_history CASCADE;
DROP TABLE IF EXISTS pets CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS pet_breeds CASCADE;
DROP TABLE IF EXISTS pet_owners CASCADE;

-- Drop reference tables
DROP TABLE IF EXISTS pet_colors CASCADE;
DROP TABLE IF EXISTS pet_living_environment CASCADE;
DROP TABLE IF EXISTS pet_socialization_levels CASCADE;
DROP TABLE IF EXISTS pet_temperaments CASCADE;
DROP TABLE IF EXISTS pet_fur_types CASCADE;
DROP TABLE IF EXISTS pet_fur_lengths CASCADE;
DROP TABLE IF EXISTS pet_sizes CASCADE;
DROP TABLE IF EXISTS pet_genders CASCADE;
DROP TABLE IF EXISTS pet_types CASCADE;

-- Drop system tables
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS clinics CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE pet_genders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    label VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Popula com valores iniciais
INSERT INTO pet_genders (id, name, label) VALUES
    ('b7f56d9e-2a5c-4c5b-9e2d-8d7f3b6a1e2f', 'Male', 'Macho'),
    ('f3c8a7d2-6e4b-4a1f-9c5d-2b7e6d8f3a9c', 'Female', 'Fêmea');

CREATE TABLE pet_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    label VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Popula com valores iniciais
INSERT INTO pet_types (id, name, label) VALUES
    ('c8060d02-3ad5-417c-b259-e466342f5c29', 'Dog', 'Cachorro'),
    ('6cd6a064-6216-48e3-8b5a-d8ed8ed8e7e2', 'Cat', 'Gato'),
    ('0836b61a-bf62-452c-a0d9-c8799cfbbf37', 'Bird', 'Pássaro'),
    ('ea07bbc6-6fa7-421f-a8f7-5f5d1e504d58', 'Rabbit', 'Coelho'),
    ('33ebddfe-8a32-44ba-ae76-49c25dc2b70e', 'Hamster', 'Hamster'),
    ('664fae8a-4008-4202-97eb-bd30a1517220', 'Ferret', 'Furão'),
    ('8eb31d0f-4d72-4529-8605-480102ecd379', 'Turtle', 'Tartaruga'),
    ('9f7b02c1-219a-4b37-8c01-937b88d2bf45', 'Fish', 'Peixe'),
    ('b5e4d442-6d84-4a6c-9b11-8c9e4a2f3d21', 'Guinea Pig', 'Porquinho da Índia'),
    ('c3a9d45e-8f12-4d3b-95e7-d9c3e7a2b1f8', 'Parrot', 'Papagaio'),
    ('d2f1e3b7-4c6a-4d8b-9e5f-8b7a9c6d5e4f', 'Snake', 'Cobra'),
    ('e5d4c3b2-1a2b-4c3d-5e6f-7a8b9c0d1e2f', 'Lizard', 'Lagarto'),
    ('f8e7d6c5-4b3a-4d1c-0a9b-8c7d6e5f4e3d', 'Hedgehog', 'Ouriço'),
    ('a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d', 'Chinchilla', 'Chinchila'),
    ('b2c3d4e5-6f7a-8b9c-0d1e-2f3a4b5c6d7e', 'Iguana', 'Iguana'),
    ('c4d5e6f7-8a9b-0c1d-2e3f-4a5b6c7d8e9f', 'Horse', 'Cavalo'),
    ('d5e6f7a8-9b0c-1d2e-3f4a-5b6c7d8e9f0a', 'Cattle', 'Gado/Boi'),
    ('e6f7a8b9-0c1d-2e3f-4a5b-6c7d8e9f0a1b', 'Sheep', 'Ovelha'),
    ('f7a8b9c0-1d2e-3f4a-5b6c-7d8e9f0a1b2c', 'Goat', 'Cabra'),
    ('a8b9c0d1-2e3f-4a5b-6c7d-8e9f0a1b2c3d', 'Pig', 'Porco'),
    ('b9c0d1e2-3f4a-5b6c-7d8e-9f0a1b2c3d4e', 'Chicken', 'Galinha'),
    ('c0d1e2f3-4a5b-6c7d-8e9f-0a1b2c3d4e5f', 'Duck', 'Pato'),
    ('d1e2f3a4-5b6c-7d8e-9f0a-1b2c3d4e5f6a', 'Donkey', 'Jumento/Burro'),
    ('e2f3a4b5-6c7d-8e9f-0a1b-2c3d4e5f6a7b', 'Mule', 'Mula'),
    ('f3a4b5c6-7d8e-9f0a-1b2c-3d4e5f6a7b8c', 'Alpaca', 'Alpaca');


CREATE TABLE pet_sizes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    label VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Popula com valores iniciais
INSERT INTO pet_sizes (id, name, label) VALUES
    ('a1b2c3d4-e5f6-4a7b-8c90-123456789abc', 'Tiny', 'Minúsculo'),
    ('b2c3d4e5-f6a7-4b8c-9d0e-234567890bcd', 'Small', 'Pequeno'),
    ('c3d4e5f6-a7b8-4c9d-0e1f-345678901cde', 'Medium', 'Médio'),
    ('d4e5f6a7-b8c9-4d0e-1f2a-456789012def', 'Large', 'Grande'),
    ('e5f6a7b8-c9d0-4e1f-2a3b-567890123efa', 'Giant', 'Gigante');


CREATE TABLE pet_fur_lengths (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    label VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO pet_fur_lengths (id, name, label) VALUES
   ('b2c3d4e5-f6a7-48b9-c0d1-e2f3a4b5c6d7', 'Hairless', 'Sem pelo'),
   ('c3d4e5f6-a7b8-49c0-d1e2-f3a4b5c6d7e8', 'Short', 'Pelo curto'),
   ('d4e5f6a7-b8c9-50d1-e2f3-a4b5c6d7e8f9', 'Medium', 'Pelo médio'),
   ('e5f6a7b8-c9d0-51e2-f3a4-b5c6d7e8f9a0', 'Long', 'Pelo longo'),
   ('f6a7b8c9-d0e1-52f3-a4b5-c6d7e8f9a0b1', 'Wire', 'Pelo áspero');

CREATE TABLE pet_fur_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    label VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO pet_fur_types (id, name, label) VALUES
   ('b2c3d4e5-f6a7-48b9-c0d1-e2f3a4b5c6d7', 'Fur', 'Pelo'),
   ('c3d4e5f6-a7b8-49c0-d1e2-f3a4b5c6d7e8', 'Feather', 'Pena'),
   ('d4e5f6a7-b8c9-50d1-e2f3-a4b5c6d7e8f9', 'Scale', 'Escama'),
   ('e5f6a7b8-c9d0-51e2-f3a4-b5c6d7e8f9a0', 'Shell', 'Casco/Carapaça'),
   ('f6a7b8c9-d0e1-52f3-a4b5-c6d7e8f9a0b1', 'Skin', 'Pele'),
   ('a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6', 'Wool', 'Lã'),
   ('b4c5d6e7-f8a9-b0c1-d2e3-f4a5b6c7d8e9', 'Mixed', 'Misto'),
   ('c5d6e7f8-a9b0-c1d2-e3f4-a5b6c7d8e9f0', 'Bristle', 'Cerdas'),
   ('d6e7f8a9-b0c1-d2e3-f4a5-b6c7d8e9f0a1', 'Quill', 'Espinho'),
   ('e7f8a9b0-c1d2-e3f4-a5b6-c7d8e9f0a1b2', 'Down', 'Penugem');

CREATE TABLE pet_temperaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    label VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Popula com valores iniciais
INSERT INTO pet_temperaments (id, name, label) VALUES
    ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'Docile', 'Dócil'),
    ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 'Aggressive', 'Agressivo'),
    ('c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 'Calm', 'Calmo'),
    ('d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9f', 'Playful', 'Brincalhão'),
    ('e5f6a7b8-c9d0-1e2f-3a4b-5c6d7e8f9a0b', 'Shy', 'Tímido');

-- Tabela de nível de socialização
CREATE TABLE pet_socialization_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    label VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Popula com valores iniciais
INSERT INTO pet_socialization_levels (id, name, label) VALUES
    ('f6a7b8c9-d0e1-2f3a-4b5c-6d7e8f9a0b1c', 'Very Social', 'Muito Sociável'),
    ('a7b8c9d0-e1f2-3a4b-5c6d-7e8f9a0b1c2d', 'Social', 'Sociável'),
    ('b8c9d0e1-f2a3-4b5c-6d7e-8f9a0b1c2d3e', 'Neutral', 'Neutro'),
    ('c9d0e1f2-a3b4-5c6d-7e8f-9a0b1c2d3e4f', 'Low Socialization', 'Baixa Socialização'),
    ('d0e1f2a3-b4c5-6d7e-8f9a-0b1c2d3e4f5a', 'Not Social', 'Nada Sociável');

-- Tabela de ambiente de vida
CREATE TABLE pet_living_environment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    label VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Popula com valores iniciais
INSERT INTO pet_living_environment (id, name, label) VALUES
    ('e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b', 'Indoor', 'Interno'),
    ('f2a3b4c5-d6e7-8f9a-0b1c-2d3e4f5a6b7c', 'Outdoor', 'Externo'),
    ('a3b4c5d6-e7f8-9a0b-1c2d-3e4f5a6b7c8d', 'Mixed', 'Misto');

 CREATE TABLE pet_colors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    label VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Popula com valores iniciais
INSERT INTO pet_colors (id, name, label) VALUES
    ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'Black', 'Preto'),
    ('b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 'White', 'Branco'),
    ('c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 'Brown', 'Marrom'),
    ('d4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9f', 'Gray', 'Cinza'),
    ('e5f6a7b8-c9d0-1e2f-3a4b-5c6d7e8f9a0b', 'Golden', 'Dourado'),
    ('f6a7b8c9-d0e1-2f3a-4b5c-6d7e8f9a0b1c', 'Yellow', 'Amarelo'),
    ('a7b8c9d0-e1f2-3a4b-5c6d-7e8f9a0b1c2d', 'Orange', 'Laranja'),
    ('b8c9d0e1-f2a3-4b5c-6d7e-8f9a0b1c2d3e', 'Red', 'Vermelho'),
    ('c9d0e1f2-a3b4-5c6d-7e8f-9a0b1c2d3e4f', 'Blue', 'Azul'),
    ('d0e1f2a3-b4c5-6d7e-8f9a-0b1c2d3e4f5a', 'Green', 'Verde'),
    ('e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b', 'Colorful', 'Colorido'),
    ('f2a3b4c5-d6e7-8f9a-0b1c-2d3e4f5a6b7c', 'Spotted', 'Malhado'),
    ('a3b4c5d6-e7f8-9a0b-1c2d-3e4f5a6b7c8d', 'Striped', 'Listrado'),
    ('b4c5d6e7-f8a9-0b1c-2d3e-4f5a6b7c8d9e', 'Beige', 'Bege'),
    ('c5d6e7f8-a9b0-1c2d-3e4f-5a6b7c8d9e0f', 'Cream', 'Creme'),
    ('d6e7f8a9-b0c1-2d3e-4f5a-6b7c8d9e0f1a', 'Lilac', 'Lilás'),
    ('e7f8a9b0-c1d2-3e4f-5a6b-7c8d9e0f1a2b', 'Caramel', 'Caramelo');


CREATE TABLE pet_breeds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pet_type_id UUID NOT NULL REFERENCES pet_types(id),
    name VARCHAR(255) NOT NULL,
    label VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(pet_type_id, name)
);

-- Dogs (pet_type_id: 'c8060d02-3ad5-417c-b259-e466342f5c29')
INSERT INTO pet_breeds (id, pet_type_id, name, label) VALUES
    ('a1b2c3d4-5e6f-7a8b-9c0d-a1b2c3d4e5f6', 'c8060d02-3ad5-417c-b259-e466342f5c29', 'Labrador Retriever', 'Labrador Retriever'),
    ('b2c3d4e5-6f7a-8b9c-0d1e-b2c3d4e5f6a7', 'c8060d02-3ad5-417c-b259-e466342f5c29', 'German Shepherd', 'Pastor Alemão'),
    ('c3d4e5f6-7a8b-9c0d-1e2f-c3d4e5f6a7b8', 'c8060d02-3ad5-417c-b259-e466342f5c29', 'Golden Retriever', 'Golden Retriever'),
    ('d4e5f6a7-8b9c-0d1e-2f3a-d4e5f6a7b8c9', 'c8060d02-3ad5-417c-b259-e466342f5c29', 'French Bulldog', 'Bulldog Francês'),
    ('e5f6a7b8-9c0d-1e2f-3a4b-e5f6a7b8c9d0', 'c8060d02-3ad5-417c-b259-e466342f5c29', 'Bulldog', 'Bulldog Inglês'),
    ('f6a7b8c9-0d1e-2f3a-4b5c-f6a7b8c9d0e1', 'c8060d02-3ad5-417c-b259-e466342f5c29', 'Poodle', 'Poodle'),
    ('a7b8c9d0-1e2f-3a4b-5c6d-a7b8c9d0e1f2', 'c8060d02-3ad5-417c-b259-e466342f5c29', 'Rottweiler', 'Rottweiler'),
    ('b8c9d0e1-2f3a-4b5c-6d7e-b8c9d0e1f2a3', 'c8060d02-3ad5-417c-b259-e466342f5c29', 'Yorkshire Terrier', 'Yorkshire Terrier'),
    ('c9d0e1f2-3a4b-5c6d-7e8f-c9d0e1f2a3b4', 'c8060d02-3ad5-417c-b259-e466342f5c29', 'Boxer', 'Boxer'),
    ('d0e1f2a3-4b5c-6d7e-8f9a-d0e1f2a3b4c5', 'c8060d02-3ad5-417c-b259-e466342f5c29', 'Dachshund', 'Dachshund');

-- Cats (pet_type_id: '6cd6a064-6216-48e3-8b5a-d8ed8ed8e7e2')
INSERT INTO pet_breeds (id, pet_type_id, name, label) VALUES
    ('e1f2a3b4-5c6d-7e8f-9a0b-e1f2a3b4c5d6', '6cd6a064-6216-48e3-8b5a-d8ed8ed8e7e2', 'Persian', 'Persa'),
    ('f2a3b4c5-6d7e-8f9a-0b1c-f2a3b4c5d6e7', '6cd6a064-6216-48e3-8b5a-d8ed8ed8e7e2', 'Maine Coon', 'Maine Coon'),
    ('a3b4c5d6-7e8f-9a0b-1c2d-a3b4c5d6e7f8', '6cd6a064-6216-48e3-8b5a-d8ed8ed8e7e2', 'Siamese', 'Siamês'),
    ('b4c5d6e7-8f9a-0b1c-2d3e-b4c5d6e7f8a9', '6cd6a064-6216-48e3-8b5a-d8ed8ed8e7e2', 'British Shorthair', 'Britânico de Pelo Curto'),
    ('c5d6e7f8-9a0b-1c2d-3e4f-c5d6e7f8a9b0', '6cd6a064-6216-48e3-8b5a-d8ed8ed8e7e2', 'Ragdoll', 'Ragdoll'),
    ('d6e7f8a9-0b1c-2d3e-4f5a-d6e7f8a9b0c1', '6cd6a064-6216-48e3-8b5a-d8ed8ed8e7e2', 'Bengal', 'Bengal'),
    ('e7f8a9b0-1c2d-3e4f-5a6b-e7f8a9b0c1d2', '6cd6a064-6216-48e3-8b5a-d8ed8ed8e7e2', 'Sphynx', 'Sphynx'),
    ('f8a9b0c1-2d3e-4f5a-6b7c-f8a9b0c1d2e3', '6cd6a064-6216-48e3-8b5a-d8ed8ed8e7e2', 'Russian Blue', 'Azul Russo'),
    ('a9b0c1d2-3e4f-5a6b-7c8d-a9b0c1d2e3f4', '6cd6a064-6216-48e3-8b5a-d8ed8ed8e7e2', 'Scottish Fold', 'Scottish Fold');

-- Birds (pet_type_id: '0836b61a-bf62-452c-a0d9-c8799cfbbf37')
INSERT INTO pet_breeds (id, pet_type_id, name, label) VALUES
    ('b0c1d2e3-4f5a-6b7c-8d9e-b0c1d2e3f4a5', '0836b61a-bf62-452c-a0d9-c8799cfbbf37', 'Budgerigar', 'Periquito Australiano'),
    ('c1d2e3f4-5a6b-7c8d-9e0f-c1d2e3f4a5b6', '0836b61a-bf62-452c-a0d9-c8799cfbbf37', 'Cockatiel', 'Calopsita'),
    ('d2e3f4a5-6b7c-8d9e-0f1a-d2e3f4a5b6c7', '0836b61a-bf62-452c-a0d9-c8799cfbbf37', 'Lovebird', 'Agapornis'),
    ('e3f4a5b6-7c8d-9e0f-1a2b-e3f4a5b6c7d8', '0836b61a-bf62-452c-a0d9-c8799cfbbf37', 'Canary', 'Canário'),
    ('f4a5b6c7-8d9e-0f1a-2b3c-f4a5b6c7d8e9', '0836b61a-bf62-452c-a0d9-c8799cfbbf37', 'African Grey Parrot', 'Papagaio Africano'),
    ('a5b6c7d8-9e0f-1a2b-3c4d-a5b6c7d8e9f0', '0836b61a-bf62-452c-a0d9-c8799cfbbf37', 'Macaw', 'Arara');

-- Rabbits (pet_type_id: 'ea07bbc6-6fa7-421f-a8f7-5f5d1e504d58')
INSERT INTO pet_breeds (id, pet_type_id, name, label) VALUES
    ('b6c7d8e9-0f1a-2b3c-4d5e-b6c7d8e9f0a1', 'ea07bbc6-6fa7-421f-a8f7-5f5d1e504d58', 'Holland Lop', 'Holland Lop'),
    ('c7d8e9f0-1a2b-3c4d-5e6f-c7d8e9f0a1b2', 'ea07bbc6-6fa7-421f-a8f7-5f5d1e504d58', 'Dutch', 'Holandês'),
    ('d8e9f0a1-2b3c-4d5e-6f7a-d8e9f0a1b2c3', 'ea07bbc6-6fa7-421f-a8f7-5f5d1e504d58', 'Mini Rex', 'Mini Rex'),
    ('e9f0a1b2-3c4d-5e6f-7a8b-e9f0a1b2c3d4', 'ea07bbc6-6fa7-421f-a8f7-5f5d1e504d58', 'Netherland Dwarf', 'Anão Holandês'),
    ('f0a1b2c3-4d5e-6f7a-8b9c-f0a1b2c3d4e5', 'ea07bbc6-6fa7-421f-a8f7-5f5d1e504d58', 'Lionhead', 'Cabeça de Leão');

-- Hamsters (pet_type_id: '33ebddfe-8a32-44ba-ae76-49c25dc2b70e')
INSERT INTO pet_breeds (id, pet_type_id, name, label) VALUES
    ('a1b2c3d4-5e6f-7a8b-9c0d-a1b2c3d4e5f4', '33ebddfe-8a32-44ba-ae76-49c25dc2b70e', 'Syrian', 'Sírio'),
    ('b2c3d4e5-6f7a-8b9c-0d1e-b2c3d4e5f6a3', '33ebddfe-8a32-44ba-ae76-49c25dc2b70e', 'Roborovski', 'Roborovski'),
    ('c3d4e5f6-7a8b-9c0d-1e2f-c3d4e5f6a7b7', '33ebddfe-8a32-44ba-ae76-49c25dc2b70e', 'Chinese', 'Chinês'),
    ('d4e5f6a7-8b9c-0d1e-2f3a-d4e5f6a7b8c6', '33ebddfe-8a32-44ba-ae76-49c25dc2b70e', 'Winter White', 'Anão Russo'),
    ('e5f6a7b8-9c0d-1e2f-3a4b-e5f6a7b8c9d5', '33ebddfe-8a32-44ba-ae76-49c25dc2b70e', 'Campbell', 'Campbell');

-- Create indexes for better query performance
CREATE INDEX idx_pet_breeds_pet_type_id ON pet_breeds(pet_type_id);
CREATE INDEX idx_pet_breeds_name ON pet_breeds(name);

-- Simplified clinics table
CREATE TABLE clinics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO clinics (id, name) VALUES
    ('a9424d1d-3c68-4d04-b856-fe04470bae9d', 'Clinica Teste'),
    ('a9424d1d-3c68-4d04-b856-fe04470bae88', 'Clínica Veterinária São Francisco'),
    ('b8f7c9d2-3e56-4f12-a345-b91c89234567', 'Pet Care Plus'),
    ('c7d8e9f0-4e67-5a23-b456-f12a34b56789', 'Animal Health Center');


CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Inserir os roles predefinidos com UUIDs gerados
INSERT INTO user_roles (id, role) VALUES
    ('068f9962-74c4-46d9-8205-a39abfa9e872', 'veterinary'),
    ('2397fb23-2807-4aef-b787-492d6567497f', 'petOwner'),
    ('9c1c38ac-1410-439a-859c-7f37faddf28c', 'admin'),
    ('112d1e2a-aae3-4050-9901-986c12a12f07', 'superAdmin');

-- Users table with clinic relationship
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id),
    role_id UUID REFERENCES user_roles(id),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    photo VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (id, clinic_id, role_id, name, email, password, phone, photo) VALUES
   ('d5ff22bf-701a-41a1-90a6-50e611188542', 'a9424d1d-3c68-4d04-b856-fe04470bae9d', '9c1c38ac-1410-439a-859c-7f37faddf28c', 'Administrador', 'admin@example.com', '$2a$10$hefYAyoyrox8nCZfikteQO66ft9vr1OldYeSudRqeoMOycxdvHxAa', '11999999999', NULL),
   ('e6aa33ca-812b-52b2-91b7-61f722299653', 'b8f7c9d2-3e56-4f12-a345-b91c89234567', '112d1e2a-aae3-4050-9901-986c12a12f07', 'Super Administrador', 'superadmin@example.com', '$2a$10$hefYAyoyrox8nCZfikteQO66ft9vr1OldYeSudRqeoMOycxdvHxAa', '11988888888', NULL),
   ('f7bb44db-923c-63c3-92c8-72a833300764', 'b8f7c9d2-3e56-4f12-a345-b91c89234567', '068f9962-74c4-46d9-8205-a39abfa9e872', 'Dr. Veterinário', 'vet@example.com', '$2a$10$hefYAyoyrox8nCZfikteQO66ft9vr1OldYeSudRqeoMOycxdvHxAa', '11977777777', NULL),
   ('a8cc55ec-034d-74d4-93d9-83a944411875', 'c7d8e9f0-4e67-5a23-b456-f12a34b56789', '2397fb23-2807-4aef-b787-492d6567497f', 'pet_owner_id de Pet', 'petowner@example.com', '$2a$10$hefYAyoyrox8nCZfikteQO66ft9vr1OldYeSudRqeoMOycxdvHxAa', '11966666666', NULL),
   ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'a9424d1d-3c68-4d04-b856-fe04470bae9d', '2397fb23-2807-4aef-b787-492d6567497f', 'Maria Silva', 'maria.silva@email.com', '$2a$10$hefYAyoyrox8nCZfikteQO66ft9vr1OldYeSudRqeoMOycxdvHxAa', '11999887766', NULL),
   ('b9eb54ac-41c3-4e52-b71e-45b5dc3c3f9a', 'b8f7c9d2-3e56-4f12-a345-b91c89234567', '2397fb23-2807-4aef-b787-492d6567497f', 'João Santos', 'joao.santos@email.com', '$2a$10$hefYAyoyrox8nCZfikteQO66ft9vr1OldYeSudRqeoMOycxdvHxAa', '11988776655', NULL),
   ('c2d8e4f6-1234-5678-90ab-cdef01234567', 'c7d8e9f0-4e67-5a23-b456-f12a34b56789', '2397fb23-2807-4aef-b787-492d6567497f', 'Ana Oliveira', 'ana.oliveira@email.com', '$2a$10$hefYAyoyrox8nCZfikteQO66ft9vr1OldYeSudRqeoMOycxdvHxAa', '11977665544', NULL),
   ('d3e4f5a6-7890-abcd-ef12-345678901234', 'a9424d1d-3c68-4d04-b856-fe04470bae9d', '2397fb23-2807-4aef-b787-492d6567497f', 'Carlos Pereira', 'carlos.pereira@email.com', '$2a$10$hefYAyoyrox8nCZfikteQO66ft9vr1OldYeSudRqeoMOycxdvHxAa', '11966554433', NULL),
   ('e5f6a7b8-9012-3456-7890-abcdef123456', 'b8f7c9d2-3e56-4f12-a345-b91c89234567', '2397fb23-2807-4aef-b787-492d6567497f', 'Patricia Lima', 'patricia.lima@email.com', '$2a$10$hefYAyoyrox8nCZfikteQO66ft9vr1OldYeSudRqeoMOycxdvHxAa', '11955443322', NULL),
   ('f6a7b8c9-0123-4567-89ab-cdef12345678', 'c7d8e9f0-4e67-5a23-b456-f12a34b56789', '2397fb23-2807-4aef-b787-492d6567497f', 'Roberto Costa', 'roberto.costa@email.com', '$2a$10$hefYAyoyrox8nCZfikteQO66ft9vr1OldYeSudRqeoMOycxdvHxAa', '11944332211', NULL),
   ('a7b8c9d0-1234-5678-90ab-cdef23456789', 'a9424d1d-3c68-4d04-b856-fe04470bae9d', '2397fb23-2807-4aef-b787-492d6567497f', 'Fernanda Santos', 'fernanda.santos@email.com', '$2a$10$hefYAyoyrox8nCZfikteQO66ft9vr1OldYeSudRqeoMOycxdvHxAa', '11933221100', NULL),
   ('b8c9d0e1-2345-6789-0abc-def345678901', 'b8f7c9d2-3e56-4f12-a345-b91c89234567', '2397fb23-2807-4aef-b787-492d6567497f', 'Lucas Ferreira', 'lucas.ferreira@email.com', '$2a$10$hefYAyoyrox8nCZfikteQO66ft9vr1OldYeSudRqeoMOycxdvHxAa', '11922110099', NULL),
    ('c9d0e1f2-a3b4-4c5d-8e9f-0123456789ab', 'c7d8e9f0-4e67-5a23-b456-f12a34b56789', '2397fb23-2807-4aef-b787-492d6567497f', 'Amanda Rodrigues', 'amanda.rodrigues@email.com', '$2a$10$hefYAyoyrox8nCZfikteQO66ft9vr1OldYeSudRqeoMOycxdvHxAa', '11911009988', NULL),
    ('d0e1f2a3-b4c5-4d6e-8f9a-0123456789bc', 'a9424d1d-3c68-4d04-b856-fe04470bae9d', '2397fb23-2807-4aef-b787-492d6567497f', 'Bruno Almeida', 'bruno.almeida@email.com', '$2a$10$hefYAyoyrox8nCZfikteQO66ft9vr1OldYeSudRqeoMOycxdvHxAa', '11900998877', NULL);

CREATE TABLE pet_owners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id),
    name VARCHAR(200) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    cellphone VARCHAR(20),
    cpf VARCHAR(14),
    rg VARCHAR(20),
    date_of_birth DATE NOT NULL,
    address_street VARCHAR(255) NOT NULL,
    address_number VARCHAR(20) NOT NULL,
    address_complement VARCHAR(100),
    address_neighborhood VARCHAR(100) NOT NULL,
    address_city VARCHAR(100) NOT NULL,
    address_state VARCHAR(2) NOT NULL,
    address_zipcode VARCHAR(9) NOT NULL,
    emergency_contact_name VARCHAR(200),
    emergency_contact_phone VARCHAR(20),
    occupation VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    has_platform_access BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_email_per_clinic UNIQUE (clinic_id, email),
    CONSTRAINT unique_cpf_per_clinic UNIQUE (clinic_id, cpf)
);

INSERT INTO pet_owners (
   id,
   clinic_id,
   name,
   email,
   phone,
   cellphone,
   cpf,
   rg,
   date_of_birth,
   address_street,
   address_number,
   address_complement,
   address_neighborhood,
   address_city,
   address_state,
   address_zipcode,
   emergency_contact_name,
   emergency_contact_phone,
   occupation,
   has_platform_access
) VALUES
   (
       'f47ac10b-58cc-4372-a567-0e02b2c3d479',
       'a9424d1d-3c68-4d04-b856-fe04470bae9d',
       'Maria Silva Santos',
       'maria.silva@email.com',
       '1133445566',
       '11987654321',
       '123.456.789-01',
       '12.345.678-9',
       '1985-03-15',
       'Rua das Flores',
       '123',
       'Apto 45',
       'Jardim Europa',
       'São Paulo',
       'SP',
       '01234567',
       'João Silva',
       '11999887766',
       'Professora',
       true
   ),
   (
       'f47ac10b-58cc-4372-a567-0e02b2c3d480',
       'a9424d1d-3c68-4d04-b856-fe04470bae88',
       'João Pereira Lima',
       'joao.pereira@email.com',
       '1122334455',
       '11976543210',
       '234.567.890-12',
       '23.456.789-0',
       '1990-07-22',
       'Avenida Paulista',
       '1000',
       'Sala 502',
       'Bela Vista',
       'São Paulo',
       'SP',
       '04567890',
       'Ana Pereira',
       '11988776655',
       'Engenheiro',
       false
   ),
   (
       'f47ac10b-58cc-4372-a567-0e02b2c3d481',
       'b8f7c9d2-3e56-4f12-a345-b91c89234567',
       'Ana Costa Oliveira',
       'ana.costa@email.com',
       '1144556677',
       '11965432109',
       '345.678.901-23',
       '34.567.890-1',
       '1988-11-30',
       'Rua Augusta',
       '500',
       NULL,
       'Consolação',
       'São Paulo',
       'SP',
       '05678901',
       'Pedro Costa',
       '11977665544',
       'Médica',
       true
   ),
   (
       'f47ac10b-58cc-4372-a567-0e02b2c3d482',
       'c7d8e9f0-4e67-5a23-b456-f12a34b56789',
       'Carlos Santos Ferreira',
       'carlos.santos@email.com',
       '1155667788',
       '11954321098',
       '456.789.012-34',
       '45.678.901-2',
       '1982-05-10',
       'Rua Oscar Freire',
       '200',
       'Casa 2',
       'Jardim Paulista',
       'São Paulo',
       'SP',
       '06789012',
       'Marina Santos',
       '11966554433',
       'Advogado',
       false
   ),
   (
       'f47ac10b-58cc-4372-a567-0e02b2c3d483',
       'a9424d1d-3c68-4d04-b856-fe04470bae9d',
       'Patricia Lima Souza',
       'patricia.lima@email.com',
       '1166778899',
       '11943210987',
       '567.890.123-45',
       '56.789.012-3',
       '1995-09-25',
       'Alameda Santos',
       '750',
       'Apto 123',
       'Cerqueira César',
       'São Paulo',
       'SP',
       '07890123',
       'Roberto Souza',
       '11955443322',
       'Dentista',
       true
   );

-- Índices para melhorar performance
CREATE INDEX idx_pet_owners_clinic_id ON pet_owners(clinic_id);
CREATE INDEX idx_pet_owners_is_active ON pet_owners(is_active);
CREATE INDEX idx_pet_owners_has_platform_access ON pet_owners(has_platform_access);


CREATE TABLE pets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pet_owner_id UUID NOT NULL REFERENCES pet_owners(id),
    pet_type_id UUID NOT NULL REFERENCES pet_types(id),
    pet_gender_id UUID NOT NULL REFERENCES pet_genders(id),
    pet_breed_id UUID NOT NULL REFERENCES pet_breeds(id),
    pet_color_id UUID NOT NULL REFERENCES pet_colors(id),
    pet_size_id UUID NOT NULL REFERENCES pet_sizes(id),
    pet_fur_type_id UUID NOT NULL REFERENCES pet_fur_types(id),
    pet_fur_length_id UUID NOT NULL REFERENCES pet_fur_lengths(id),
    pet_temperament_id UUID NOT NULL REFERENCES pet_temperaments(id),
    pet_socialization_level_id UUID NOT NULL REFERENCES pet_socialization_levels(id),
    pet_living_environment_id UUID NOT NULL REFERENCES pet_living_environment(id),
    name VARCHAR(255) NOT NULL,
    date_of_birthday DATE NOT NULL,
    photo VARCHAR(255) DEFAULT NULL,
    latest_weight VARCHAR(7) DEFAULT NULL,
    microchip_number VARCHAR(50) DEFAULT NULL,
    blood_type VARCHAR(20) DEFAULT NULL,
    is_neutered BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    death_date DATE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_death_date_active CHECK (
        (is_active = true AND death_date IS NULL) OR
        (is_active = false)
    )
);

-- Criar índices para melhorar performance
CREATE INDEX idx_pets_pet_owner_id ON pets(pet_owner_id);
CREATE INDEX idx_pets_pet_type_id ON pets(pet_type_id);
CREATE INDEX idx_pets_pet_breed_id ON pets(pet_breed_id);
CREATE INDEX idx_pets_pet_gender_id ON pets(pet_gender_id);
CREATE INDEX idx_pets_pet_color_id ON pets(pet_color_id);
CREATE INDEX idx_pets_pet_size_id ON pets(pet_size_id);
CREATE INDEX idx_pets_pet_temperament_id ON pets(pet_temperament_id);
CREATE INDEX idx_pets_pet_socialization_level_id ON pets(pet_socialization_level_id);
CREATE INDEX idx_pets_pet_living_environment_id ON pets(pet_living_environment_id);
CREATE INDEX idx_pets_is_active ON pets(is_active);

INSERT INTO pets (
    id,
    pet_owner_id,
    pet_type_id,
    pet_gender_id,
    pet_breed_id,
    pet_color_id,
    pet_size_id,
    pet_fur_type_id,
    pet_fur_length_id,
    pet_temperament_id,
    pet_socialization_level_id,
    pet_living_environment_id,
    name,
    date_of_birthday,
    photo,
    latest_weight,
    microchip_number,
    blood_type,
    is_neutered,
    is_active,
    death_date,
    created_at,
    updated_at
) VALUES
    -- Labrador Retriever
    ('d1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    'c8060d02-3ad5-417c-b259-e466342f5c29',
    'b7f56d9e-2a5c-4c5b-9e2d-8d7f3b6a1e2f',
    'a1b2c3d4-5e6f-7a8b-9c0d-a1b2c3d4e5f6',
    'e5f6a7b8-c9d0-1e2f-3a4b-5c6d7e8f9a0b',
    'c3d4e5f6-a7b8-4c9d-0e1f-345678901cde',
    'b2c3d4e5-f6a7-48b9-c0d1-e2f3a4b5c6d7',
    'c3d4e5f6-a7b8-49c0-d1e2-f3a4b5c6d7e8',
    'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    'f6a7b8c9-d0e1-2f3a-4b5c-6d7e8f9a0b1c',
    'e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b',
    'Thor',
    '2022-03-15',
    NULL,
    '30,5',
    'CHIP123456',
    'DEA 1.1',
    true,
    true,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP),

    -- German Shepherd
    ('d393efde-c83d-49d6-8463-3bbff873aebb',
    'f47ac10b-58cc-4372-a567-0e02b2c3d480',
    'c8060d02-3ad5-417c-b259-e466342f5c29',
    'b7f56d9e-2a5c-4c5b-9e2d-8d7f3b6a1e2f',
    'b2c3d4e5-6f7a-8b9c-0d1e-b2c3d4e5f6a7',
    'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f',
    'd4e5f6a7-b8c9-4d0e-1f2a-456789012def',
    'b2c3d4e5-f6a7-48b9-c0d1-e2f3a4b5c6d7',
    'd4e5f6a7-b8c9-50d1-e2f3-a4b5c6d7e8f9',
    'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
    'f6a7b8c9-d0e1-2f3a-4b5c-6d7e8f9a0b1c',
    'a3b4c5d6-e7f8-9a0b-1c2d-3e4f5a6b7c8d',
    'Max',
    '2023-01-20',
    NULL,
    '32',
    'CHIP345678',
    'DEA 1.1',
    false,
    true,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP),
    -- Golden Retriever
    ('e2f3a4b5-c6d7-5e8f-9a0b-1c2d3e4f5a6b',
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    'c8060d02-3ad5-417c-b259-e466342f5c29',
    'f3c8a7d2-6e4b-4a1f-9c5d-2b7e6d8f3a9c',
    'c3d4e5f6-7a8b-9c0d-1e2f-c3d4e5f6a7b8',
    'e5f6a7b8-c9d0-1e2f-3a4b-5c6d7e8f9a0b',
    'd4e5f6a7-b8c9-4d0e-1f2a-456789012def',
    'b2c3d4e5-f6a7-48b9-c0d1-e2f3a4b5c6d7',
    'd4e5f6a7-b8c9-50d1-e2f3-a4b5c6d7e8f9',
    'd4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9f',
    'f6a7b8c9-d0e1-2f3a-4b5c-6d7e8f9a0b1c',
    'a3b4c5d6-e7f8-9a0b-1c2d-3e4f5a6b7c8d',
    'Luna',
    '2021-07-10',
    NULL,
    '26,2',
    'CHIP789012',
    'DEA 1.1 Negative',
    true,
    true,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP);

CREATE TABLE pet_weight_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pet_id UUID NOT NULL,
    weight DECIMAL(5,2) NOT NULL, -- Permite pesos de 0.01 até 999.99 kg
    weigh_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
);

-- Índice para melhorar performance de consultas por pet_id
CREATE INDEX idx_pet_weight_history_pet_id ON pet_weight_history(pet_id);
-- Índice composto para melhorar performance de consultas por pet e data
CREATE INDEX idx_pet_weight_history_pet_date ON pet_weight_history(pet_id, weigh_date);

-- Vaccine protocols table
CREATE TABLE protocols (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID NOT NULL REFERENCES clinics(id),
    pet_type_id UUID NOT NULL REFERENCES pet_types(id),
    vaccine_name VARCHAR(255) NOT NULL,
    initial_dose_age INTEGER NOT NULL,
    booster_frequency INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT positive_months CHECK (initial_dose_age >= 0 AND booster_frequency > 0)
);

INSERT INTO protocols (id, clinic_id, pet_type_id, vaccine_name, initial_dose_age, booster_frequency) VALUES
    ('a7d7cdac-f16a-42a9-8796-6eea106daeee', 'a9424d1d-3c68-4d04-b856-fe04470bae9d', 'c8060d02-3ad5-417c-b259-e466342f5c29', 'Vacina V8', 2, 12),
    ('b8e8debd-a27b-43b0-9807-7ffb217ebfff', 'b8f7c9d2-3e56-4f12-a345-b91c89234567', '6cd6a064-6216-48e3-8b5a-d8ed8ed8e7e2', 'Vacina V4 Felina', 3, 12),
    ('c9f9efce-b38c-44c1-9918-8aac328fcaaa', 'c7d8e9f0-4e67-5a23-b456-f12a34b56789', '0836b61a-bf62-452c-a0d9-c8799cfbbf37', 'Vacina New Castle', 4, 6);


-- Vaccines table with protocol link and auto-due-date
CREATE TABLE vaccines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pet_id UUID NOT NULL REFERENCES pets(id),
    protocol_id UUID NOT NULL REFERENCES protocols(id),
    name VARCHAR(255) NOT NULL,
    date_administered DATE NOT NULL,
    next_due_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO vaccines (id, pet_id, protocol_id, name, date_administered, next_due_date) VALUES
    ('aa0afaaa-c49a-45a2-9029-9aaa439a1234', 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a', 'a7d7cdac-f16a-42a9-8796-6eea106daeee', 'Vacina V8', '2023-01-15', '2024-01-15'),
    ('bb1bfbbb-d50b-46b3-9130-0bbb540b5678', 'd393efde-c83d-49d6-8463-3bbff873aebb', 'b8e8debd-a27b-43b0-9807-7ffb217ebfff', 'Vacina V4 Felina', '2023-02-20', '2024-02-20'),
    ('cc2cfccc-e61c-47c4-9241-1ccc651c9abc', 'e2f3a4b5-c6d7-5e8f-9a0b-1c2d3e4f5a6b', 'c9f9efce-b38c-44c1-9918-8aac328fcaaa', 'Vacina New Castle', '2023-03-25', '2023-09-25');


-- Users policies
CREATE POLICY "Users can view their own data"
    ON users FOR SELECT
    TO authenticated
    USING (auth.uid()::uuid = id);

CREATE POLICY "Users can update their own data"
    ON users FOR UPDATE
    TO authenticated
    USING (auth.uid()::uuid = id);

CREATE POLICY "Vets can view clinic users"
    ON users FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u
            JOIN user_roles r ON u.role_id = r.id
            WHERE u.id = auth.uid()::uuid
            AND r.role = 'veterinary'
            AND u.clinic_id = users.clinic_id
        )
    );

-- Pets policies
CREATE POLICY "pet_owner_ids can view their own pets"
    ON pets FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u
            JOIN user_roles r ON u.role_id = r.id
            WHERE u.id = auth.uid()::uuid
            AND r.role = 'petOwner'
            AND u.id = pets.pet_owner_id
        )
    );

CREATE POLICY "pet_owner_ids can insert their own pets"
    ON pets FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u
            JOIN user_roles r ON u.role_id = r.id
            WHERE u.id = auth.uid()::uuid
            AND r.role = 'petOwner'
            AND u.id = pet_owner_id
        )
    );

CREATE POLICY "pet_owner_ids can update their own pets"
    ON pets FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u
            JOIN user_roles r ON u.role_id = r.id
            WHERE u.id = auth.uid()::uuid
            AND r.role = 'petOwner'
            AND u.id = pets.pet_owner_id
        )
    );

CREATE POLICY "Vets can view clinic pets"
    ON pets FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u
            JOIN user_roles r ON u.role_id = r.id
            WHERE u.id = auth.uid()::uuid
            AND r.role = 'veterinary'
            AND u.clinic_id = (
                SELECT clinic_id FROM users WHERE id = pets.pet_owner_id
            )
        )
    );

-- Protocols policies
CREATE POLICY "Vets can manage their clinic protocols"
    ON protocols FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u
            JOIN user_roles r ON u.role_id = r.id
            WHERE u.id = auth.uid()::uuid
            AND r.role = 'veterinary'
            AND u.clinic_id = protocols.clinic_id
        )
    );

CREATE POLICY "Users can view their clinic protocols"
    ON protocols FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()::uuid
            AND u.clinic_id = protocols.clinic_id
        )
    );

-- Vaccines policies
CREATE POLICY "Users can view their pets vaccines"
    ON vaccines FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM pets p
            JOIN users u ON u.id = p.pet_owner_id
            JOIN user_roles r ON u.role_id = r.id
            WHERE u.id = auth.uid()::uuid
            AND r.role = 'petOwner'
            AND p.id = vaccines.pet_id
        )
    );

CREATE POLICY "Vets can manage vaccines"
    ON vaccines FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u
            JOIN user_roles r ON u.role_id = r.id
            WHERE u.id = auth.uid()::uuid
            AND r.role = 'veterinary'
            AND u.clinic_id = (
                SELECT protocols.clinic_id
                FROM protocols
                WHERE protocols.id = vaccines.protocol_id
            )
        )
    );

-- Clinics policies
CREATE POLICY "Public can view clinics"
    ON clinics FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Vets can manage their clinic"
    ON clinics FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u
            JOIN user_roles r ON u.role_id = r.id
            WHERE u.id = auth.uid()::uuid
            AND r.role = 'veterinary'
            AND u.clinic_id = clinics.id
        )
    );