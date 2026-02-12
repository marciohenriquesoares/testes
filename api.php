<?php
// api.php - Backend Corrigido (Suporte a IDs "1.1")
session_start();
error_reporting(E_ALL);
ini_set('display_errors', 0); 

// Headers
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE');

// --- CONFIGURAÇÃO E SEGURANÇA ---
$db_folder = __DIR__ . '/database';
$db_file = $db_folder . '/cnab.db';

if (!file_exists($db_folder)) {
    mkdir($db_folder, 0777, true);
}
$htaccess = $db_folder . '/.htaccess';
if (!file_exists($htaccess)) {
    file_put_contents($htaccess, "Deny from all");
}

try {
    $pdo = new PDO("sqlite:$db_file");
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // --- CRIAÇÃO DE TABELAS ---

    // 1. Tabela de Tickets (CORRIGIDO: id TEXT para aceitar '1.1')
    $pdo->exec("CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY, 
        parent_id TEXT DEFAULT NULL,
        empresa TEXT,
        banco TEXT,
        num_banco TEXT,
        agencia TEXT,
        conta TEXT,
        modalidade TEXT,
        ocorrencia TEXT,
        cod TEXT,
        tipo_arq TEXT,
        metodo TEXT,
        topico TEXT,
        prioridade TEXT,
        dt_prevista TEXT,
        dt_tramitacao TEXT,
        dt_conclusao TEXT,
        status TEXT,
        percentual INTEGER,
        tags TEXT,
        responsavel TEXT,
        obs TEXT,
        styles TEXT,
        expanded INTEGER DEFAULT 0
    )");

    // 2. Configurações
    $pdo->exec("CREATE TABLE IF NOT EXISTS configs (key TEXT PRIMARY KEY, value TEXT)");
    
    // 3. Contas Bancárias
    $pdo->exec("CREATE TABLE IF NOT EXISTS bank_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        oracle_name TEXT,
        account_number TEXT,
        bank_name TEXT,
        agency TEXT,
        company_name TEXT,
        bank_number TEXT
    )");
    
    // 4. Usuários
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        permissions TEXT
    )");

    // --- SEED DE ADMIN ---
    $stmt = $pdo->query("SELECT COUNT(*) FROM users WHERE username = 'adm'");
    if ($stmt->fetchColumn() == 0) {
        $passHash = password_hash('teste123', PASSWORD_DEFAULT);
        $perms = json_encode([
            'grid_view'=>true, 'grid_edit'=>true,
            'kanban_view'=>true, 'kanban_edit'=>true,
            'dash_view'=>true, 'dash_edit'=>true,
            'admin'=>true
        ]);
        $pdo->prepare("INSERT INTO users (username, password_hash, permissions) VALUES (?, ?, ?)")
            ->execute(['adm', $passHash, $perms]);
    }

    // --- ROTEAMENTO ---
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];
    $input = json_decode(file_get_contents('php://input'), true);

    if ($action === 'load_all') {
        $configs = [];
        $stmtC = $pdo->query("SELECT key, value FROM configs");
        while($c = $stmtC->fetch(PDO::FETCH_ASSOC)) {
            $configs[$c['key']] = json_decode($c['value']);
        }

        // Ordenação natural ou numérica pode ser complexa com TEXT, 
        // mas aqui ordenamos por ID para manter consistência básica.
        $stmt = $pdo->query("SELECT * FROM tickets");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // RECONSTRUÇÃO DA ÁRVORE
        $ticketMap = [];
        $roots = [];

        // Primeiro passo: Mapear todos
        foreach ($rows as &$row) {
            $row['children'] = []; 
            $row['styles'] = json_decode($row['styles'] ?? '{}'); 
            $row['expanded'] = (bool)$row['expanded'];
            $ticketMap[(string)$row['id']] = &$row; // Força chave string para garantir match
        }

        // Segundo passo: Montar hierarquia
        foreach ($rows as &$row) {
            $pid = (string)$row['parent_id'];
            if (!empty($pid) && isset($ticketMap[$pid])) {
                $ticketMap[$pid]['children'][] = &$row;
            } else {
                // Se não tem pai ou pai não existe, é raiz
                // (Ignora órfãos de pais excluídos para não quebrar a UI, ou trata como raiz)
                if (empty($pid)) {
                    $roots[] = &$row;
                }
            }
        }
        
        // Ordena as raízes pelo ID (opcional, para manter ordem visual)
        usort($roots, function($a, $b) { return strnatcmp($a['id'], $b['id']); });

        echo json_encode(['status'=>'success', 'db'=>$roots, 'configs'=>$configs]); 
        exit;
    }

    if ($action === 'save_data') {
        $pdo->beginTransaction();
        try {
            $pdo->exec("DELETE FROM tickets");

            $stmtInsert = $pdo->prepare("INSERT INTO tickets 
                (id, parent_id, empresa, banco, num_banco, agencia, conta, modalidade, ocorrencia, cod, tipo_arq, metodo, topico, prioridade, dt_prevista, dt_tramitacao, dt_conclusao, status, percentual, tags, responsavel, obs, styles, expanded) 
                VALUES 
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

            function saveNodes($nodes, $parentId, $stmt) {
                foreach ($nodes as $node) {
                    $stmt->execute([
                        (string)$node['id'], // Garante que salva como string "1.1"
                        $parentId ? (string)$parentId : null,
                        $node['empresa'] ?? '',
                        $node['banco'] ?? '',
                        $node['num_banco'] ?? '',
                        $node['agencia'] ?? '',
                        $node['conta'] ?? '',
                        $node['modalidade'] ?? '',
                        $node['ocorrencia'] ?? '',
                        $node['cod'] ?? '',
                        $node['tipo_arq'] ?? '',
                        $node['metodo'] ?? '',
                        $node['topico'] ?? '',
                        $node['prioridade'] ?? 'Média',
                        $node['dt_prevista'] ?? '',
                        $node['dt_tramitacao'] ?? '',
                        $node['dt_conclusao'] ?? '',
                        $node['status'] ?? 'Previsto',
                        $node['percentual'] ?? 0,
                        $node['tags'] ?? '',
                        $node['responsavel'] ?? '',
                        $node['obs'] ?? '',
                        json_encode($node['styles'] ?? (object)[]),
                        isset($node['expanded']) && $node['expanded'] ? 1 : 0
                    ]);

                    if (!empty($node['children']) && is_array($node['children'])) {
                        saveNodes($node['children'], $node['id'], $stmt);
                    }
                }
            }

            saveNodes($input, null, $stmtInsert);

            $pdo->commit();
            echo json_encode(['status'=>'success']);
        } catch (Exception $e) {
            $pdo->rollBack();
            throw $e;
        }
        exit;
    }

    // ... (O restante do código: save_config, login, users, accounts MANTÉM IGUAL) ...
    
    if ($action === 'save_config') {
        $pdo->prepare("INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)")
            ->execute([$input['key'], json_encode($input['value'])]);
        echo json_encode(['status'=>'success']); exit;
    }

    if ($action === 'clear_all_tickets') {
        $pdo->exec("DELETE FROM tickets"); 
        echo json_encode(['status'=>'success']); exit;
    }

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

    if ($action === 'logout') { 
        session_destroy(); 
        echo json_encode(['status'=>'success']); 
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

    if ($action === 'list_users') {
        $users = $pdo->query("SELECT id, username, permissions FROM users")->fetchAll(PDO::FETCH_ASSOC);
        foreach($users as &$u) $u['permissions'] = json_decode($u['permissions']);
        echo json_encode(['status'=>'success', 'data'=>$users]); exit;
    }

    if ($action === 'save_user' && $method === 'POST') {
        $perms = json_encode($input['permissions']);
        if (isset($input['id']) && $input['id']) {
            if (!empty($input['password'])) {
                $hash = password_hash($input['password'], PASSWORD_DEFAULT);
                $pdo->prepare("UPDATE users SET username=?, password_hash=?, permissions=? WHERE id=?")
                    ->execute([$input['username'], $hash, $perms, $input['id']]);
            } else {
                $pdo->prepare("UPDATE users SET username=?, permissions=? WHERE id=?")
                    ->execute([$input['username'], $perms, $input['id']]);
            }
        } else {
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
                $i['oracle_name'], $i['account_number'], $i['bank_name'], $i['agency'], $i['company_name'], $i['bank_number']??''
            ]);
        }
        $pdo->commit(); 
        echo json_encode(['status'=>'success']); exit;
    }

    if ($action === 'delete_account') {
        $pdo->prepare("DELETE FROM bank_accounts WHERE id=?")->execute([$input['id']]);
        echo json_encode(['status'=>'success']); exit;
    }
    
    if ($action === 'clear_accounts') {
        $pdo->exec("DELETE FROM bank_accounts"); 
        $pdo->exec("DELETE FROM sqlite_sequence WHERE name='bank_accounts'");
        echo json_encode(['status'=>'success']); exit;
    }

} catch (Exception $e) { 
    http_response_code(500); 
    echo json_encode(['status'=>'error', 'message'=>$e->getMessage()]); 
}
?>