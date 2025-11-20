pipeline {
    agent any

    tools {
        nodejs 'NodeJS'
    }

    environment {
        APP_VM_IP = '172.31.9.55'
        DEPLOY_DIR = '/var/www/employee-app'
        NODE_ENV = 'production'
        MONGO_URI = "mongodb://172.31.9.55:27017/employee_a"
    }

    stages {

        stage('Checkout') {
            steps {
                echo 'Pulling code from GitHub...'
                git branch: 'main',
                    credentialsId: 'github-creds',
                    url: 'https://github.com/Karun-Kumar-Undrajavarapu/Emp-App'
            }
        }

        stage('Install Dependencies') {
            steps {
                echo 'Installing production dependencies...'
                sh 'npm ci --omit=dev'
            }
            post {
                always {
                    stash includes: 'node_modules/**', name: 'node_modules_cache'
                }
            }
        }

        stage('Lint & Validate') {
            steps {
                echo 'Linting code...'
                echo 'No lint configured — skipping.'

                script {
                    sh '''
                        # Start node server temporarily
                        nohup node server.js > smoke.log 2>&1 &
                        SERVER_PID=$!
                        sleep 10

                        # Ensure server process is alive
                        if ! ps -p $SERVER_PID > /dev/null; then
                            echo "Server failed to start!"
                            cat smoke.log
                            exit 1
                        fi

                        # API health check (should return 401 without auth)
                        STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:83/api/employees || true)

                        if [ "$STATUS" != "401" ]; then
                            echo "API health check failed! Expected 401, got $STATUS"
                            cat smoke.log
                            exit 1
                        fi

                        # Cleanup
                        kill $SERVER_PID || true
                        rm smoke.log

                        echo "Smoke test passed: Server healthy."
                    '''
                }
            }
        }

        stage('Test') {
            steps {
                echo 'Running tests...'
                sh 'npm test || true'
            }
            post {
                always {
                    junit '**/test-results.xml'
                    archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
                }
            }
        }

        stage('Deploy') {
            when { branch 'main' }
            steps {
                echo 'Deploying to Application VM...'

                sshagent(['ssh-to-app']) {
                    sh """
                        # Sync repo to server (skip .env & logs)
                        rsync -avz --delete \
                            --exclude='.env' \
                            --exclude='*.log' \
                            --exclude='backup/' \
                            --exclude='node_modules' \
                            $WORKSPACE/ ubuntu@$APP_VM_IP:$DEPLOY_DIR/

                        ssh ubuntu@$APP_VM_IP "
                            cd $DEPLOY_DIR

                            # Reinstall node dependencies
                            rm -rf node_modules package-lock.json
                            npm ci --only=production

                            # Stop old server if running
                            pkill -f 'node server.js' || true
                            sleep 2

                            # Start new production server
                            nohup node server.js > app.log 2>&1 &
                            sleep 5

                            # Validate DB connected using logs
                            if ! grep -q 'connected' app.log; then
                                echo 'Warning: No DB connection log found. Continuing...'
                            fi

                            # API health check
                            if ! curl -s -o /dev/null http://localhost:83/api/employees; then
                                echo 'Post-deploy health check failed!'
                                exit 1
                            fi

                            echo 'Deploy successful — server running on port 83'
                        "

                        ssh ubuntu@$APP_VM_IP 'sudo nginx -t && sudo systemctl reload nginx'
                    """
                }
            }
        }
    }

    post {
        always {
            echo 'Pipeline complete! App accessible via http://APP_VM_IP:80'
            cleanWs()
        }
        success {
            echo 'Deployment SUCCESS — test CRUD at /employees.html'
        }
        failure {
            echo 'Pipeline FAILED — check logs above.'
        }
    }
}

