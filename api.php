<?php
// api.php - Backend Completo (Versão Estável - Sem Gantt)
session_start();
error_reporting(E_ALL);
ini_set('display_errors', 0);

// Headers padrão para JSON e permissões de acesso
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE');

// Definição do Banco de Dados
$db_folder = __DIR__ . '/database';
$db_file = $db_folder . '/cnab.db';

try {
    // Cria pasta do banco se não existir
    if (!file_exists($db_folder)) mkdir($db_folder, 0777, true);

    // Conexão SQLite
    $pdo = new PDO("sqlite:$db_file");
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // --- CRIAÇÃO DE TABELAS (ESTRUTURA ORIGINAL) ---

    // 1. Tabela de Tickets (O "Coração" do Grid e Kanban - JSON Gigante)
    $pdo->exec("CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, json_data TEXT)");

    // 2. Tabela de Configurações Gerais
    $pdo->exec("CREATE TABLE IF NOT EXISTS configs (key TEXT PRIMARY KEY, value TEXT)");
    
    // 3. Tabela de Contas Bancárias (Relacional)
    $pdo->exec("CREATE TABLE IF NOT EXISTS bank_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        oracle_name TEXT,
        account_number TEXT,
        bank_name TEXT,
        agency TEXT,
        company_name TEXT,
        bank_number TEXT
    )");
    
    // 4. Tabela de Usuários e Permissões
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        permissions TEXT
    )");

    // MIGRATION: Garante que a coluna bank_number exista (para bancos antigos)
    try { $pdo->exec("ALTER TABLE bank_accounts ADD COLUMN bank_number TEXT"); } catch (Exception $e) {}

    // SEED: Cria usuário ADM padrão se não existir (senha: teste123)
    $stmt = $pdo->query("SELECT COUNT(*) FROM users WHERE username = 'adm'");
    if ($stmt->fetchColumn() == 0) {
        $passHash = password_hash('teste123', PASSWORD_DEFAULT);
        // Permissões completas padrão
        $perms = json_encode([
            'grid_view'=>true, 'grid_edit'=>true,
            'kanban_view'=>true, 'kanban_edit'=>true,
            'dash_view'=>true, 'dash_edit'=>true,
            'admin'=>true
        ]);
        $stmt = $pdo->prepare("INSERT INTO users (username, password_hash, permissions) VALUES (?, ?, ?)");
        $stmt->execute(['adm', $passHash, $perms]);
    }

    // --- CAPTURA DE DADOS DA REQUISIÇÃO ---
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];
    $input = json_decode(file_get_contents('php://input'), true);

    // =================================================================================
    // MÓDULO DE AUTENTICAÇÃO
    // =================================================================================
    if ($action === 'login' && $method === 'POST') {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->execute([$input['username']]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user && password_verify($input['password'], $user['password_hash'])) {
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['permissions'] = $user['permissions'];
            echo json_encode(['status'=>'success', 'permissions'=>json_decode($user['permissions'])]);
        } else {
            echo json_encode(['status'=>'error', 'message'=>'Credenciais inválidas']);
        }
        exit;
    }
    
    if ($action === 'check_session') {
        if (isset($_SESSION['user_id'])) {
            echo json_encode(['status'=>'logged_in', 'permissions'=>json_decode($_SESSION['permissions'])]);
        } else {
            echo json_encode(['status'=>'logged_out']);
        }
        exit;
    }
    
    if ($action === 'logout') { 
        session_destroy(); 
        echo json_encode(['status'=>'success']); 
        exit; 
    }

    // =================================================================================
    // MÓDULO DE GESTÃO DE USUÁRIOS
    // =================================================================================
    if ($action === 'list_users') {
        $users = $pdo->query("SELECT id, username, permissions FROM users")->fetchAll(PDO::FETCH_ASSOC);
        foreach($users as &$u) $u['permissions'] = json_decode($u['permissions']);
        echo json_encode(['status'=>'success', 'data'=>$users]); exit;
    }

    if ($action === 'save_user' && $method === 'POST') {
        $perms = json_encode($input['permissions']);
        if (isset($input['id']) && $input['id']) {
            // Update
            if (!empty($input['password'])) {
                $hash = password_hash($input['password'], PASSWORD_DEFAULT);
                $pdo->prepare("UPDATE users SET username=?, password_hash=?, permissions=? WHERE id=?")
                    ->execute([$input['username'], $hash, $perms, $input['id']]);
            } else {
                $pdo->prepare("UPDATE users SET username=?, permissions=? WHERE id=?")
                    ->execute([$input['username'], $perms, $input['id']]);
            }
        } else {
            // Insert
            $hash = password_hash($input['password'], PASSWORD_DEFAULT);
            $pdo->prepare("INSERT INTO users (username, password_hash, permissions) VALUES (?, ?, ?)")
                ->execute([$input['username'], $hash, $perms]);
        }
        echo json_encode(['status'=>'success']); exit;
    }

    if ($action === 'delete_user') {
        if ($input['username'] === 'adm') { 
            echo json_encode(['status'=>'error', 'message'=>'Não pode excluir ADM']); exit; 
        }
        $pdo->prepare("DELETE FROM users WHERE id=?")->execute([$input['id']]);
        echo json_encode(['status'=>'success']); exit;
    }

    // =================================================================================
    // MÓDULO PRINCIPAL (GRID / KANBAN / DASHBOARD)
    // =================================================================================
    if ($action === 'load_all') {
        // Carrega o JSON gigante dos tickets e as configurações
        $dbData = $pdo->query("SELECT json_data FROM tickets LIMIT 1")->fetchColumn();
        
        $configs = [];
        $stmtC = $pdo->query("SELECT key, value FROM configs");
        while($c = $stmtC->fetch(PDO::FETCH_ASSOC)) {
            $configs[$c['key']] = json_decode($c['value']);
        }
        
        echo json_encode([
            'status'=>'success', 
            'db'=>json_decode($dbData)?:[], 
            'configs'=>$configs
        ]); 
        exit;
    }

    if ($action === 'save_data') {
        // Salva o estado atual do Grid (JSON completo)
        $json = file_get_contents('php://input');
        if($pdo->query("SELECT COUNT(*) FROM tickets")->fetchColumn() == 0) {
            $pdo->prepare("INSERT INTO tickets (json_data) VALUES (?)")->execute([$json]);
        } else {
            $pdo->prepare("UPDATE tickets SET json_data = ?")->execute([$json]);
        }
        echo json_encode(['status'=>'success']); exit;
    }

    if ($action === 'save_config') {
        $pdo->prepare("INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)")
            ->execute([$input['key'], json_encode($input['value'])]);
        echo json_encode(['status'=>'success']); exit;
    }

    if ($action === 'clear_all_tickets') {
        $pdo->exec("DELETE FROM tickets"); 
        $pdo->exec("DELETE FROM sqlite_sequence WHERE name='tickets'");
        echo json_encode(['status'=>'success']); exit;
    }

    // =================================================================================
    // MÓDULO DE CONTAS BANCÁRIAS
    // =================================================================================
    if ($action === 'list_accounts') {
        $data = $pdo->query("SELECT * FROM bank_accounts ORDER BY company_name, bank_name")->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['status'=>'success', 'data'=>$data]); exit;
    }

    if ($action === 'save_account') {
        $bn = $input['bank_number'] ?? '';
        if (isset($input['id']) && $input['id']) {
            $pdo->prepare("UPDATE bank_accounts SET oracle_name=?, account_number=?, bank_name=?, agency=?, company_name=?, bank_number=? WHERE id=?")
                ->execute([$input['oracle_name'], $input['account_number'], $input['bank_name'], $input['agency'], $input['company_name'], $bn, $input['id']]);
        } else {
            $pdo->prepare("INSERT INTO bank_accounts (oracle_name, account_number, bank_name, agency, company_name, bank_number) VALUES (?,?,?,?,?,?)")
                ->execute([$input['oracle_name'], $input['account_number'], $input['bank_name'], $input['agency'], $input['company_name'], $bn]);
        }
        echo json_encode(['status'=>'success']); exit;
    }

    if ($action === 'import_accounts') {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare("INSERT INTO bank_accounts (oracle_name, account_number, bank_name, agency, company_name, bank_number) VALUES (?,?,?,?,?,?)");
        foreach($input as $i) {
            $stmt->execute([
                $i['oracle_name'], 
                $i['account_number'], 
                $i['bank_name'], 
                $i['agency'], 
                $i['company_name'], 
                $i['bank_number']??''
            ]);
        }
        $pdo->commit(); 
        echo json_encode(['status'=>'success']); exit;
    }

    if ($action === 'clear_accounts') {
        $pdo->exec("DELETE FROM bank_accounts"); 
        $pdo->exec("DELETE FROM sqlite_sequence WHERE name='bank_accounts'");
        echo json_encode(['status'=>'success']); exit;
    }

    if ($action === 'delete_account') {
        $pdo->prepare("DELETE FROM bank_accounts WHERE id=?")->execute([$input['id']]);
        echo json_encode(['status'=>'success']); exit;
    }

} catch (Exception $e) { 
    http_response_code(500); 
    echo json_encode(['status'=>'error', 'message'=>$e->getMessage()]); 
}
?>