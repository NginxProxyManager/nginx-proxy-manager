import groovy.transform.Field

@Field
def shOutput = ""
def buildxPushTags = ""

def getVersion() {
	ver = sh(script: 'cat .version', returnStdout: true)
	return ver.trim()
}

def getCommit() {
	ver = sh(script: 'git log -n 1 --format=%h', returnStdout: true)
	return ver.trim()
}

pipeline {
	agent {
		label 'docker-multiarch'
	}
	options {
		buildDiscarder(logRotator(numToKeepStr: '5'))
		disableConcurrentBuilds()
		ansiColor('xterm')
	}
	environment {
		DOCKER_ORG                 = 'jc21'
		IMAGE                      = 'nginx-proxy-manager'
		BUILD_VERSION              = getVersion()
		BUILD_COMMIT               = getCommit()
		MAJOR_VERSION              = '3'
		BRANCH_LOWER               = "${BRANCH_NAME.toLowerCase().replaceAll('/', '-')}"
		COMPOSE_PROJECT_NAME       = "npm_${BRANCH_LOWER}_${BUILD_NUMBER}"
		COMPOSE_FILE               = 'docker/docker-compose.ci.yml'
		COMPOSE_INTERACTIVE_NO_CLI = 1
		BUILDX_NAME                = "${COMPOSE_PROJECT_NAME}"
		DOCS_BUCKET                = 'jc21-npm-site-next' // TODO: change to prod when official
		DOCS_CDN                   = 'E2Z0128EHS0Q23'     // TODO: same
	}
	stages {
		stage('Environment') {
			parallel {
				stage('Master') {
					when {
						branch 'master'
					}
					steps {
						script {
							buildxPushTags = "-t docker.io/${DOCKER_ORG}/${IMAGE}:${BUILD_VERSION} -t docker.io/${DOCKER_ORG}/${IMAGE}:${MAJOR_VERSION} -t docker.io/${DOCKER_ORG}/${IMAGE}:latest"
							echo 'Building on Master is disabled!'
							sh 'exit 1'
						}
					}
				}
				stage('Other') {
					when {
						not {
							branch 'master'
						}
					}
					steps {
						script {
							// Defaults to the Branch name, which is applies to all branches AND pr's
							// buildxPushTags = "-t docker.io/jc21/${IMAGE}:github-${BRANCH_LOWER}"
							buildxPushTags = "-t docker.io/${DOCKER_ORG}/${IMAGE}:v3"
						}
					}
				}
			}
		}
		stage('Build') {
			steps {
				sh './scripts/ci/build-frontend'
				sh './scripts/ci/test-backend'
				sh './scripts/ci/build-backend'
				// Build the docker image used for testing below
				sh '''docker build --pull --no-cache \\
					-t "${IMAGE}:${BRANCH_LOWER}-ci-${BUILD_NUMBER}" \\
					-f docker/Dockerfile \\
					--build-arg BUILD_COMMIT="${BUILD_COMMIT}" \\
					--build-arg BUILD_DATE="$(date '+%Y-%m-%d %T %Z')" \\
					--build-arg BUILD_VERSION="${BUILD_VERSION}" \\
					.
				'''
			}
			post {
				success {
					archiveArtifacts allowEmptyArchive: false, artifacts: 'bin/*'
					script {
						shOutput = ""
					}
				}
			}
		}
		stage('Test Sqlite') {
			environment {
				COMPOSE_PROJECT_NAME = "npm_${BRANCH_LOWER}_${BUILD_NUMBER}_sqlite"
				COMPOSE_FILE         = 'docker/docker-compose.ci.yml'
			}
			when {
				not {
					equals expected: 'UNSTABLE', actual: currentBuild.result
				}
			}
			steps {
				sh 'rm -rf ./test/results/junit/*'
				sh './scripts/ci/fulltest-cypress'
				// Adding this here as the schema needs to come from a running stack, but this will be used by docs later
				sh 'docker-compose exec -T fullstack curl -s --output /temp-docs/api-schema.json "http://fullstack:81/api/schema"'
			}
			post {
				always {
					// Dumps to analyze later
					sh 'mkdir -p debug/sqlite'
					sh 'docker logs $(docker-compose ps --all -q fullstack) > debug/sqlite/docker_fullstack.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q stepca) > debug/sqlite/docker_stepca.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q pdns) > debug/sqlite/docker_pdns.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q pdns-db) > debug/sqlite/docker_pdns-db.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q dnsrouter) > debug/sqlite/docker_dnsrouter.log 2>&1'
					junit 'test/results/junit/*'
					sh 'docker-compose down --remove-orphans --volumes -t 30 || true'
				}
			}
		}
		stage('Test Mysql') {
			environment {
				COMPOSE_PROJECT_NAME = "npm_${BRANCH_LOWER}_${BUILD_NUMBER}_mysql"
				COMPOSE_FILE         = 'docker/docker-compose.ci.yml:docker/docker-compose.ci.mysql.yml'
			}
			when {
				not {
					equals expected: 'UNSTABLE', actual: currentBuild.result
				}
			}
			steps {
				sh 'rm -rf ./test/results/junit/*'
				sh './scripts/ci/fulltest-cypress'
			}
			post {
				always {
					// Dumps to analyze later
					sh 'mkdir -p debug/mysql'
					sh 'docker logs $(docker-compose ps --all -q fullstack) > debug/mysql/docker_fullstack.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q stepca) > debug/mysql/docker_stepca.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q pdns) > debug/mysql/docker_pdns.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q pdns-db) > debug/mysql/docker_pdns-db.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q dnsrouter) > debug/mysql/docker_dnsrouter.log 2>&1'
					junit 'test/results/junit/*'
					sh 'docker-compose down --remove-orphans --volumes -t 30 || true'
				}
			}
		}
		stage('Test Postgres') {
			environment {
				COMPOSE_PROJECT_NAME = "npm_${BRANCH_LOWER}_${BUILD_NUMBER}_postgres"
				COMPOSE_FILE         = 'docker/docker-compose.ci.yml:docker/docker-compose.ci.postgres.yml'
			}
			when {
				not {
					equals expected: 'UNSTABLE', actual: currentBuild.result
				}
			}
			steps {
				sh 'rm -rf ./test/results/junit/*'
				sh './scripts/ci/fulltest-cypress'
			}
			post {
				always {
					// Dumps to analyze later
					sh 'mkdir -p debug/postgres'
					sh 'docker logs $(docker-compose ps --all -q fullstack) > debug/postgres/docker_fullstack.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q stepca) > debug/postgres/docker_stepca.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q pdns) > debug/postgres/docker_pdns.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q pdns-db) > debug/postgres/docker_pdns-db.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q dnsrouter) > debug/postgres/docker_dnsrouter.log 2>&1'
					junit 'test/results/junit/*'
					sh 'docker-compose down --remove-orphans --volumes -t 30 || true'
				}
			}
		}
		stage('Docs') {
			when {
				not {
					equals expected: 'UNSTABLE', actual: currentBuild.result
				}
			}
			steps {
				dir(path: 'docs') {
					sh 'yarn install'
					sh 'yarn build'
				}

				// API Docs:
				sh 'mkdir -p "docs/.vuepress/dist/api"'
				sh 'mv docs/api-schema.json docs/.vuepress/dist/api/'

				dir(path: 'docs/.vuepress/dist') {
					sh 'tar -czf ../../docs.tgz *'
				}
			}
		}
		stage('MultiArch Build') {
			when {
				not {
					equals expected: 'UNSTABLE', actual: currentBuild.result
				}
			}
			steps {
				withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
					sh 'docker login -u "${duser}" -p "${dpass}"'
					sh "./scripts/buildx --push ${buildxPushTags}"
					// sh './scripts/buildx -o type=local,dest=docker-build'
				}
			}
		}
		stage('Docs Deploy') {
			when {
				allOf {
					branch 'v3' // TODO: change to master when ready
					not {
						equals expected: 'UNSTABLE', actual: currentBuild.result
					}
				}
			}
			steps {
				npmDocsRelease("$DOCS_BUCKET", "$DOCS_CDN")
			}
		}
		stage('PR Comment') {
			when {
				allOf {
					changeRequest()
					not {
						equals expected: 'UNSTABLE', actual: currentBuild.result
					}
				}
			}
			steps {
				script {
					npmGithubPrComment("Docker Image for build ${BUILD_NUMBER} is available on [DockerHub](https://cloud.docker.com/repository/docker/${DOCKER_ORG}/${IMAGE}) as `${DOCKER_ORG}/${IMAGE}:github-${BRANCH_LOWER}`\n\n**Note:** ensure you backup your NPM instance before testing this PR image! Especially if this PR contains database changes.", true)
				}
			}
		}
	}
	post {
		always {
			sh 'docker-compose down --rmi all --remove-orphans --volumes -t 30 || true'
			sh './scripts/ci/build-cleanup'
			echo 'Reverting ownership'
			sh 'docker run --rm -v $(pwd):/data jc21/gotools:latest chown -R "$(id -u):$(id -g)" /data'
		}
		success {
			juxtapose event: 'success'
			sh 'figlet "SUCCESS"'
		}
		failure {
			dir(path: 'test') {
				archiveArtifacts allowEmptyArchive: true, artifacts: 'results/**/*', excludes: '**/*.xml'
			}
			archiveArtifacts(artifacts: 'debug/*', allowEmptyArchive: true)
			juxtapose event: 'failure'
			sh 'figlet "FAILURE"'
		}
		unstable {
			dir(path: 'test') {
				archiveArtifacts allowEmptyArchive: true, artifacts: 'results/**/*', excludes: '**/*.xml'
			}
			archiveArtifacts(artifacts: 'debug/*', allowEmptyArchive: true)
			juxtapose event: 'unstable'
			sh 'figlet "UNSTABLE"'
		}
	}
}
